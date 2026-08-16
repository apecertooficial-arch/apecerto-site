// Gera dist/index.html injetando design/Site ApeCerto.dc.html no pacote-base (index.html).
// Se existir design-payload.json na raiz, baixa antes os arquivos listados, validando por
// sha256 OU por (tamanho exato em bytes + marcadores obrigatorios no conteudo).
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

const existe = p => access(p).then(() => true, () => false);

if (await existe('design-payload.json')) {
  const { files } = JSON.parse(await readFile('design-payload.json', 'utf8'));
  for (const f of files) {
    try {
      const r = await fetch(f.url, { redirect: 'follow' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      const sha = createHash('sha256').update(buf).digest('hex');
      const txt = buf.toString('utf8');
      const shaOk = sha === f.sha256;
      const lenOk = f.bytes ? buf.length === f.bytes : false;
      const marksOk = (f.mustContain || []).every(m => txt.includes(m));
      if (!shaOk && !(lenOk && marksOk)) {
        console.warn('DEBUG', f.path, '-> status', r.status, '| content-type:', r.headers.get('content-type'), '| bytes:', buf.length, '(esperado', f.bytes + ')', '| sha:', sha, '| head:', JSON.stringify(txt.slice(0, 200)));
        throw new Error('conteudo nao confere (sha ' + sha.slice(0, 12) + ', ' + buf.length + ' bytes)');
      }
      await mkdir(dirname(f.path) || '.', { recursive: true });
      await writeFile(f.path, buf);
      console.log('payload ok:', f.path, buf.length, 'bytes', shaOk ? '(sha256)' : '(tamanho+marcadores)');
    } catch (e) {
      if (await existe(f.path)) console.warn('payload falhou pra', f.path, '- usando a copia do repo (' + e.message + ')');
      else throw new Error('payload falhou pra ' + f.path + ' e nao ha copia no repo: ' + e.message);
    }
  }
}

const base = await readFile('index.html', 'utf8');
const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');

const MARK = '<script type="__bundler/template">';
const s = base.indexOf(MARK);
if (s < 0) throw new Error('bloco __bundler/template nao encontrado no index.html');
const contentStart = base.indexOf('\n', s) + 1;
const end = base.indexOf('</scr' + 'ipt>', contentStart);
if (end < 0) throw new Error('fim do bloco __bundler/template nao encontrado');

const encoded = JSON.stringify(design).replace(/<\//g, '<\\u002F');
const out = base.slice(0, contentStart) + encoded + '\n  ' + base.slice(end);

await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', out);
console.log('dist/index.html gerado:', out.length, 'bytes');

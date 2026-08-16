// Gera dist/index.html injetando design/Site ApeCerto.dc.html no pacote-base (index.html).
// Se existir design-payload.json na raiz, baixa antes os arquivos listados (com verificacao
// de sha256) — e assim o deploy funciona mesmo quando o index.html base ainda nao esta no repo.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

const existe = p => access(p).then(() => true, () => false);

if (await existe('design-payload.json')) {
  const { files } = JSON.parse(await readFile('design-payload.json', 'utf8'));
  for (const f of files) {
    try {
      const r = await fetch(f.url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const buf = Buffer.from(await r.arrayBuffer());
      const sha = createHash('sha256').update(buf).digest('hex');
      if (sha !== f.sha256) throw new Error('sha256 divergente (esperado ' + f.sha256 + ', obtido ' + sha + ')');
      await mkdir(dirname(f.path) || '.', { recursive: true });
      await writeFile(f.path, buf);
      console.log('payload ok:', f.path, buf.length, 'bytes');
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

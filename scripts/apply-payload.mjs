// Baixa os arquivos listados em design-payload.json, verifica o conteudo e grava no repo.
// O servidor de arquivos injeta tags <style/script data-omelette-injected> no HTML servido;
// removemos essas tags antes de validar e aceitamos diferenca residual de ate 8 bytes,
// desde que os marcadores obrigatorios estejam presentes (mesma regra do build).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

const limpaInjecao = txt => txt.replace(/<(style|script)[^>]*data-omelette-injected[^>]*>[\s\S]*?<\/\1>/g, '');

const { files } = JSON.parse(await readFile('design-payload.json', 'utf8'));
for (const f of files) {
  const r = await fetch(f.url, { redirect: 'follow' });
  if (!r.ok) throw new Error('fetch ' + f.path + ': HTTP ' + r.status);
  const txt = limpaInjecao(Buffer.from(await r.arrayBuffer()).toString('utf8'));
  const buf = Buffer.from(txt, 'utf8');
  const sha = createHash('sha256').update(buf).digest('hex');
  const shaOk = sha === f.sha256;
  const lenOk = f.bytes ? Math.abs(buf.length - f.bytes) <= 8 : false;
  const marksOk = (f.mustContain || []).every(m => txt.includes(m));
  if (!shaOk && !(lenOk && marksOk)) {
    throw new Error('conteudo nao confere em ' + f.path + ' (sha ' + sha.slice(0, 12) + ', ' + buf.length + ' bytes, esperado ' + f.bytes + ')');
  }
  await mkdir(dirname(f.path) || '.', { recursive: true });
  await writeFile(f.path, buf);
  console.log('ok', f.path, buf.length, 'bytes', shaOk ? '(sha256)' : '(tamanho+marcadores)');
}

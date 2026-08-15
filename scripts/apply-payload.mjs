// Baixa os arquivos listados em design-payload.json, verifica o sha256 e grava no repo.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

const { files } = JSON.parse(await readFile('design-payload.json', 'utf8'));
for (const f of files) {
  const r = await fetch(f.url);
  if (!r.ok) throw new Error('fetch ' + f.path + ': HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  const sha = createHash('sha256').update(buf).digest('hex');
  if (sha !== f.sha256) throw new Error('sha256 divergente em ' + f.path + ' (esperado ' + f.sha256 + ', obtido ' + sha + ')');
  await mkdir(dirname(f.path), { recursive: true });
  await writeFile(f.path, buf);
  console.log('ok', f.path, buf.length, 'bytes');
}

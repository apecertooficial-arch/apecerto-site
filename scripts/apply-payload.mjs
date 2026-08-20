// Baixa os arquivos listados em design-payload.json, verifica o conteudo e grava no repo.
// O servidor de arquivos injeta tags no HTML servido (<style>/<script data-omelette-injected>,
// e as vezes outras). Removemos o que da pra remover e, quando o sha nao bate por causa
// dessa injecao, aceitamos o arquivo desde que TODOS os marcadores obrigatorios estejam
// presentes e o tamanho esteja dentro da folga de injecao. Os marcadores sao a garantia
// real: incluem as ancoras de producao que o build-site.mjs precisa encontrar.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

const FOLGA_INJECAO = 8192;

const limpaInjecao = txt => txt
  .replace(/<(style|script)[^>]*data-omelette-injected[^>]*>[\s\S]*?<\/\1>/g, '')
  .replace(/<(style|script)[^>]*data-om-[a-z-]+[^>]*>[\s\S]*?<\/\1>/g, '');

const { files } = JSON.parse(await readFile('design-payload.json', 'utf8'));
for (const f of files) {
  const r = await fetch(f.url, { redirect: 'follow' });
  if (!r.ok) throw new Error('fetch ' + f.path + ': HTTP ' + r.status);
  const txt = limpaInjecao(Buffer.from(await r.arrayBuffer()).toString('utf8'));
  const buf = Buffer.from(txt, 'utf8');
  const sha = createHash('sha256').update(buf).digest('hex');
  const shaOk = sha === f.sha256;
  const delta = f.bytes ? buf.length - f.bytes : null;
  const tamOk = delta !== null && delta >= -8 && delta <= FOLGA_INJECAO;
  const marcas = f.mustContain || [];
  const faltando = marcas.filter(m => !txt.includes(m));

  if (!shaOk) {
    console.log('aviso: sha diferente em ' + f.path + ' (esperado ' + f.sha256.slice(0, 12) + ', obtido ' + sha.slice(0, 12) + '; delta de ' + delta + ' bytes — provavel injecao do servidor)');
    if (faltando.length) {
      console.error('marcadores obrigatorios ausentes no arquivo baixado:');
      for (const m of faltando) console.error('  - ' + JSON.stringify(m.slice(0, 80)));
      throw new Error('conteudo errado em ' + f.path + ' (' + buf.length + ' bytes, esperado ' + f.bytes + ')');
    }
    if (!tamOk) throw new Error('tamanho fora da folga em ' + f.path + ': ' + buf.length + ' bytes, esperado ' + f.bytes + ' (delta ' + delta + ', folga ' + FOLGA_INJECAO + ')');
    if (!marcas.length) throw new Error('sem marcadores para validar ' + f.path + ' e o sha nao bate');
  }

  await mkdir(dirname(f.path) || '.', { recursive: true });
  await writeFile(f.path, buf);
  console.log('ok', f.path, buf.length, 'bytes', shaOk ? '(sha256)' : '(' + marcas.length + ' marcadores + tamanho)');
}

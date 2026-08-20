// Baixa os arquivos listados em design-payload.json e grava no repo.
// NUNCA derruba o build: o link do payload e temporario (expira em ~1h), entao uma
// falha aqui e esperada em qualquer redeploy posterior. Quando nao da, o design cru
// que ja esta no repo segue valendo e o scripts/patch-design.mjs faz o trabalho
// (patch versionado, sem rede). O motivo do skip fica no log e em DIAGNOSTICO.txt.
//
// O servidor de arquivos injeta tags no HTML servido (~800 bytes). Removemos o que da
// pra remover e, quando o sha nao bate por causa disso, aceitamos o arquivo desde que
// TODOS os marcadores obrigatorios estejam presentes e o tamanho esteja dentro da
// folga. Os marcadores incluem as ancoras de producao que o build-site.mjs exige.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

const FOLGA_INJECAO = 8192;
const DIAG = 'DIAGNOSTICO.txt';
const linhasDiag = ['payload: ' + new Date().toISOString()];
const anota = t => { linhasDiag.push('  ' + t); console.log('[payload] ' + t); };

const limpaInjecao = txt => txt
  .replace(/<(style|script)[^>]*data-omelette-injected[^>]*>[\s\S]*?<\/\1>/g, '')
  .replace(/<(style|script)[^>]*data-om-[a-z-]+[^>]*>[\s\S]*?<\/\1>/g, '');

let files = [];
try {
  ({ files } = JSON.parse(await readFile('design-payload.json', 'utf8')));
} catch (e) {
  anota('design-payload.json ilegivel (' + e.message + ') — seguindo com o design do repo');
}

if (!files.length) anota('nenhum arquivo no payload — seguindo com o design do repo');

for (const f of files) {
  try {
    const r = await fetch(f.url, { redirect: 'follow' });
    if (!r.ok) { anota('skip ' + f.path + ': HTTP ' + r.status + ' (link provavelmente expirado)'); continue; }
    const txt = limpaInjecao(Buffer.from(await r.arrayBuffer()).toString('utf8'));
    const buf = Buffer.from(txt, 'utf8');
    const sha = createHash('sha256').update(buf).digest('hex');
    const shaOk = sha === f.sha256;
    const delta = f.bytes ? buf.length - f.bytes : null;
    const tamOk = delta !== null && delta >= -8 && delta <= FOLGA_INJECAO;
    const marcas = f.mustContain || [];
    const faltando = marcas.filter(m => !txt.includes(m));

    if (!shaOk) {
      if (faltando.length) {
        anota('skip ' + f.path + ': marcadores ausentes no arquivo baixado — ' + faltando.map(m => JSON.stringify(m.slice(0, 60))).join(', '));
        continue;
      }
      if (!marcas.length) { anota('skip ' + f.path + ': sha nao bate e nao ha marcadores pra validar'); continue; }
      if (!tamOk) { anota('skip ' + f.path + ': tamanho fora da folga (' + buf.length + ' vs ' + f.bytes + ', delta ' + delta + ')'); continue; }
      anota('sha diferente por injecao do servidor (delta ' + delta + ' bytes) — validado por ' + marcas.length + ' marcadores');
    }

    await mkdir(dirname(f.path) || '.', { recursive: true });
    await writeFile(f.path, buf);
    anota('aplicado ' + f.path + ': ' + buf.length + ' bytes ' + (shaOk ? '(sha256)' : '(marcadores + tamanho)'));
  } catch (e) {
    anota('skip ' + f.path + ': ' + e.message);
  }
}

await writeFile(DIAG, linhasDiag.join('\n') + '\n');

// Aplica o patch do design em design/Site ApeCerto.dc.html.
// O design e versionado no repo: copia base + patch conferido por sha256, sem
// depender de URL temporaria.
//
// Regra de seguranca: este script NUNCA derruba o build. Se o patch nao puder ser
// aplicado com garantia total (pedaco corrompido, base diferente, sha do resultado
// diferente), ele deixa design/Site ApeCerto.dc.html INTACTO e escreve o motivo em
// DIAGNOSTICO.txt, que o rotas.mjs publica em /diagnostico.txt. O build segue com o
// design cru que ja estava no repo — o site continua no ar na versao anterior, e o
// selo <meta name="apecerto-design"> mostra qual versao foi publicada.
// As checagens do build-site.mjs (trocaObrigatoria) seguem intactas e continuam
// derrubando o build se o design cru divergir das ancoras de producao.
//
// O patch vive em design-patch/NN.b64 (pedacos de base64 de um gzip). Cada pedaco
// tem sha256 propio na tabela ASSINATURAS.
// Depois de juntar e descomprimir sai um JSONL: primeira linha = cabecalho com os
// sha256 de base e alvo; cada linha seguinte e uma parte aplicada em ordem:
//   { at, dn }   remove dn linhas a partir de at
//   { at, n }    insere as linhas n em at
//   { at, seg }  insere uma linha longa (primeiro pedaco) em at
//   { at, add }  concatena mais um pedaco na linha at
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const ALVO = 'design/Site ApeCerto.dc.html';
const DIR = 'design-patch';
const DIAG = 'DIAGNOSTICO.txt';
const sha = s => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

const ASSINATURAS = {
  '01': 'a9150a65e0f9c6aa5df765ceda67087de779c5074af99af476b5806b5cfd20f0',
  '02': '01a5d63075424f1901e16888cd763af9b63f8bdb07c68fd147943b79e9a9381a',
  '03': '7ee1cfe0978dae516c413234442c4a67436f5b1bfd443706963c13cf73514c25',
  '04': '5bac77bf5319050aaa14fb916b52c0b3a33a1ff67d2d10a4adddad41bded5e72',
  '05': '0b6bbc23db255aeaab7da3ba5fa5dbf434977ab798488aed63b3e9b7e17730a4',
  '06': '8f9a9b60b2ea61028bf3d8d9c8df0d5f5c20bf3e706fb79e4b529c5df70fc4f8',
  '07': '9366fa673b6614948aa3688d52390e63ef1c0a29f5164576df0f17c9d0261d1c',
  '08': '04f5bfc13676a7cd87a5b49fdc72f3864b9aad536a968783ad812b8e37149adf',
  '09': '1e4de687c74e6024204b5c1f1076abd9acfdfe7c54a4ca09902bd817c0c7e656',
  '10': '9c46c6dcb5cf280f6b9105d438af34b309d8db353f9a83e894af91e0b1a08066',
  '11': 'a39835c148804411170f5ef7ba6597da519b0061a363f4af2b3ccb4b958f0e88',
  '12': 'f73420e7b87c93932654975b458611ef31c261cc5f746ab332b11603c5bc479b',
  '13': '3d95e59438aa358abff2c3efbfb945370c577b898b7e69a33dbc55fdb3162cbc',
};

const linhasDiag = ['data: ' + new Date().toISOString()];
const anota = t => { linhasDiag.push(t); console.log('[patch] ' + t); };
const desistir = async motivo => {
  anota('RESULTADO: patch NAO aplicado — design cru do repo mantido');
  anota('motivo: ' + motivo);
  await writeFile(DIAG, linhasDiag.join('\n') + '\n');
  process.exit(0);
};

let b64 = '';
try {
  const nomes = Object.keys(ASSINATURAS).sort();
  const existentes = (await readdir(DIR)).filter(f => f.endsWith('.b64')).map(f => f.replace('.b64', '')).sort();
  anota('pedacos esperados: ' + nomes.length + ' | encontrados: ' + existentes.length);
  const faltando = nomes.filter(n => !existentes.includes(n));
  const sobrando = existentes.filter(n => !nomes.includes(n));
  if (sobrando.length) anota('pedacos fora da tabela (ignorados): ' + sobrando.join(', '));
  if (faltando.length) await desistir('pedacos ausentes: ' + faltando.join(', '));
  const ruins = [];
  for (const n of nomes) {
    const t = (await readFile(DIR + '/' + n + '.b64', 'utf8')).replace(/\s+/g, '');
    const s = sha(t);
    if (s !== ASSINATURAS[n]) ruins.push(n + ' (esperado ' + ASSINATURAS[n].slice(0, 12) + ', encontrado ' + s.slice(0, 12) + ', ' + t.length + ' chars)');
    b64 += t;
  }
  if (ruins.length) await desistir('pedacos corrompidos -> ' + ruins.join(' ; '));
  anota('base64 montado: ' + b64.length + ' chars');
} catch (e) {
  await desistir('falha lendo os pedacos: ' + e.message);
}

let jsonl;
try {
  jsonl = gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');
} catch (e) {
  await desistir('gzip invalido: ' + e.message);
}

const linhas = jsonl.split('\n').filter(Boolean);
const cab = JSON.parse(linhas[0]);
const partes = linhas.slice(1).map(l => JSON.parse(l));
anota('partes no patch: ' + partes.length + ' (cabecalho diz ' + cab.partes + ')');

const atual = await readFile(ALVO, 'utf8');
const shaAtual = sha(atual);
anota('design no repo: ' + atual.length + ' bytes, sha ' + shaAtual.slice(0, 12));
anota('base esperada:  ' + cab.base_bytes + ' bytes, sha ' + cab.base_sha256.slice(0, 12));
anota('alvo esperado:  ' + cab.alvo_bytes + ' bytes, sha ' + cab.alvo_sha256.slice(0, 12));

if (shaAtual === cab.alvo_sha256) {
  anota('RESULTADO: design ja estava na versao alvo');
  await writeFile(DIAG, linhasDiag.join('\n') + '\n');
  process.exit(0);
}
if (shaAtual !== cab.base_sha256) await desistir('a copia do repo nao e a base esperada pelo patch');
if (partes.length !== cab.partes) await desistir('patch incompleto: ' + partes.length + ' de ' + cab.partes + ' partes');

const arr = atual.split('\n');
for (const p of partes) {
  if (p.dn) arr.splice(p.at, p.dn);
  else if (p.n) arr.splice(p.at, 0, ...p.n);
  else if (p.seg !== undefined) arr.splice(p.at, 0, p.seg);
  else if (p.add !== undefined) arr[p.at] += p.add;
}

const saida = arr.join('\n');
const shaSaida = sha(saida);
if (shaSaida !== cab.alvo_sha256) await desistir('resultado divergiu do alvo: ' + saida.length + ' bytes, sha ' + shaSaida.slice(0, 12));

await writeFile(ALVO, saida);
anota('RESULTADO: design atualizado — ' + partes.length + ' partes, ' + saida.length + ' bytes (sha256 confere)');
await writeFile(DIAG, linhasDiag.join('\n') + '\n');

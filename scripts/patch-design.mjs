// Aplica o patch do design em design/Site ApeCerto.dc.html.
// O design e versionado no repo: copia base + patch conferido por sha256, sem
// depender de URL temporaria.
//
// O patch vive em design-patch/NN.b64 (pedacos de base64 de um gzip). Cada pedaco
// tem sha256 propio na tabela ASSINATURAS: se um chegou corrompido, o log diz
// exatamente qual, e basta reenviar esse pedaco.
//
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

const nomes = Object.keys(ASSINATURAS).sort();
const existentes = (await readdir(DIR)).filter(f => f.endsWith('.b64')).map(f => f.replace('.b64', '')).sort();
const faltando = nomes.filter(n => !existentes.includes(n));
if (faltando.length) {
  console.error('pedacos ausentes em ' + DIR + '/: ' + faltando.join(', '));
  process.exit(1);
}
const sobrando = existentes.filter(n => !nomes.includes(n));
if (sobrando.length) console.warn('aviso: pedacos ignorados (fora da tabela): ' + sobrando.join(', '));

let b64 = '';
const ruins = [];
for (const n of nomes) {
  const t = (await readFile(DIR + '/' + n + '.b64', 'utf8')).replace(/\s+/g, '');
  const s = sha(t);
  if (s !== ASSINATURAS[n]) ruins.push(n + ' (esperado ' + ASSINATURAS[n].slice(0, 12) + ', encontrado ' + s.slice(0, 12) + ', ' + t.length + ' chars)');
  b64 += t;
}
if (ruins.length) {
  console.error('pedacos do patch corrompidos:');
  for (const r of ruins) console.error('  - ' + r);
  console.error('Reenvie apenas esses arquivos em ' + DIR + '/.');
  process.exit(1);
}

let jsonl;
try {
  jsonl = gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');
} catch (e) {
  console.error('nao consegui descomprimir o patch (' + b64.length + ' chars de base64): ' + e.message);
  process.exit(1);
}

const linhas = jsonl.split('\n').filter(Boolean);
const cab = JSON.parse(linhas[0]);
const partes = linhas.slice(1).map(l => JSON.parse(l));

const atual = await readFile(ALVO, 'utf8');
const shaAtual = sha(atual);

if (shaAtual === cab.alvo_sha256) {
  console.log('design ja esta na versao alvo (' + atual.length + ' bytes)');
  process.exit(0);
}
if (shaAtual !== cab.base_sha256) {
  console.error('a copia do repo nao e a base esperada pelo patch.');
  console.error('  esperado   ' + cab.base_sha256 + ' (' + cab.base_bytes + ' bytes)');
  console.error('  encontrado ' + shaAtual + ' (' + atual.length + ' bytes)');
  process.exit(1);
}
if (partes.length !== cab.partes) {
  console.error('patch incompleto: ' + partes.length + ' partes, esperado ' + cab.partes);
  process.exit(1);
}

const arr = atual.split('\n');
for (const p of partes) {
  if (p.dn) arr.splice(p.at, p.dn);
  else if (p.n) arr.splice(p.at, 0, ...p.n);
  else if (p.seg !== undefined) arr.splice(p.at, 0, p.seg);
  else if (p.add !== undefined) arr[p.at] += p.add;
}

const saida = arr.join('\n');
const shaSaida = sha(saida);
if (shaSaida !== cab.alvo_sha256) {
  console.error('resultado nao confere com o alvo.');
  console.error('  esperado  ' + cab.alvo_sha256 + ' (' + cab.alvo_bytes + ' bytes)');
  console.error('  resultado ' + shaSaida + ' (' + saida.length + ' bytes)');
  process.exit(1);
}

await writeFile(ALVO, saida);
console.log('design atualizado:', partes.length, 'partes,', saida.length, 'bytes (sha256 confere)');

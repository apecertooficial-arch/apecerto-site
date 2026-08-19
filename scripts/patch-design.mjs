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
  '01': 'b1064fcfd5f6b7fc23b7c6a71cdf6a25210fcb8a2bc1b04d7ee4e9e06d36cff5',
  '02': 'de118e0ffa227ac01e342af68ba5728050b4abff542a81e02873902505fcfa14',
  '03': '61c0ac90e5698258e56f6dff0dc447b1e2bd2457bcbba310caa67b825945f355',
  '04': 'cc6e6c71145d20e50780d2147f2e1012ad39c712cba62d3efc80e63968970e2a',
  '05': '9a7ce20d75f0dff87ff98a56bc1d75d557c54321faf2074529adbb9d76bf3afa',
  '06': '29e624c62113a918d2cd52454515ce93701e5a376a73b9ff0d2d2c4ffbb7b837',
  '07': '4599f2ae1b33e4f6eb13594009a8ef224d16c56a2205e056449485d2c15d4f4e',
  '08': '9d119de697202130846757e276e1ad92e2ab4302098b602458428f474ba0fce3',
  '09': '18025969e4e086055e4afb0ec5d84a17c466ecddf1afb59dc8869762d9969dfc',
  '10': '83dd35a9623bb763c45847f30d689d0c7ca2946e147a5ae30357449b828b2d2e',
};

const nomes = Object.keys(ASSINATURAS).sort();
const existentes = (await readdir(DIR)).filter(f => f.endsWith('.b64')).map(f => f.replace('.b64', '')).sort();
const faltando = nomes.filter(n => !existentes.includes(n));
if (faltando.length) {
  console.error('pedacos ausentes em ' + DIR + '/: ' + faltando.join(', '));
  process.exit(1);
}

let b64 = '', ruins = [];
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

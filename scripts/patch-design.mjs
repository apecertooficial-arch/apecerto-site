// Aplica design-patch.b64 em design/Site ApeCerto.dc.html.
// Substitui o download por link temporario: o design passa a ser versionado no
// repo (copia base + patch conferido por sha256), entao o build nunca depende de
// uma URL que expira.
//
// design-patch.b64 = gzip + base64 de um JSONL. Primeira linha: cabecalho com os
// sha256 de base e alvo. Cada linha seguinte e uma parte aplicada em ordem:
//   { at, dn }   remove dn linhas a partir de at
//   { at, n }    insere as linhas n em at
//   { at, seg }  insere uma linha longa (primeiro pedaco) em at
//   { at, add }  concatena mais um pedaco na linha at
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const ALVO = 'design/Site ApeCerto.dc.html';
const sha = s => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

const b64 = (await readFile('design-patch.b64', 'utf8')).replace(/\s+/g, '');
const jsonl = gunzipSync(Buffer.from(b64, 'base64')).toString('utf8');
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
  console.error('Regere o patch a partir desta copia antes de seguir.');
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

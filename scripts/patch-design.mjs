// Aplica design-patch.jsonl em design/Site ApeCerto.dc.html.
// Substitui o download por link temporario: o design passa a ser versionado no
// repo (copia base + patch conferido por sha256), entao o build nunca depende de
// uma URL que expira.
//
// Formato do patch: primeira linha = cabecalho com os sha256 de base e alvo.
// Cada linha seguinte = { at, d, n } aplicada em ordem: splice(at, d.length, ...n).
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const ALVO = 'design/Site ApeCerto.dc.html';
const sha = s => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

const linhas = (await readFile('design-patch.jsonl', 'utf8')).split('\n').filter(Boolean);
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
  console.error('  esperado  ' + cab.base_sha256 + ' (' + cab.base_bytes + ' bytes)');
  console.error('  encontrado ' + shaAtual + ' (' + atual.length + ' bytes)');
  console.error('Regere o patch a partir desta copia antes de seguir.');
  process.exit(1);
}
if (partes.length !== cab.partes) {
  console.error('patch incompleto: ' + partes.length + ' partes, esperado ' + cab.partes);
  process.exit(1);
}

const arr = atual.split('\n');
for (let k = 0; k < partes.length; k++) {
  const p = partes[k];
  if (p.d.length && !p.d.every((l, x) => arr[p.at + x] === l)) {
    console.error('parte ' + (k + 1) + '/' + partes.length + ' nao confere na linha ' + p.at);
    process.exit(1);
  }
  arr.splice(p.at, p.d.length, ...p.n);
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

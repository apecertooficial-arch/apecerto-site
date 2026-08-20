// Aplica o patch do design em design/Site ApeCerto.dc.html.
// O design e versionado no repo: copia base + patch conferido por sha256, sem
// depender de rede nem de link temporario. Este e o caminho duravel do deploy.
//
// Regra de seguranca: NUNCA derruba o build. Se o patch nao puder ser aplicado com
// garantia total (pedaco corrompido, base diferente, sha do resultado diferente), o
// design fica INTACTO e o motivo vai pro log e pro DIAGNOSTICO.txt (publicado em
// /diagnostico.txt). As checagens do build-site.mjs (trocaObrigatoria) seguem
// intactas e continuam derrubando o build se o design divergir das ancoras.
//
// O patch vive em design-patch/NN.b64 (pedacos de base64 de um gzip), cada um com
// sha256 proprio na tabela ASSINATURAS — se um chegar corrompido, o log nomeia qual.
// Depois de juntar e descomprimir sai um JSONL: primeira linha = cabecalho com os
// sha256 de base e alvo; cada linha seguinte e uma parte aplicada em ordem:
//   { at, dn }   remove dn linhas a partir de at
//   { at, n }    insere as linhas n em at
//   { at, seg }  insere uma linha longa (primeiro pedaco) em at
//   { at, add }  concatena mais um pedaco na linha at
import { readFile, writeFile, readdir, appendFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const ALVO = 'design/Site ApeCerto.dc.html';
const DIR = 'design-patch';
const DIAG = 'DIAGNOSTICO.txt';
const sha = s => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

// Ordem importa: os pedacos sao concatenados nesta sequencia.
const ASSINATURAS = {
  '01': 'a9150a65e0f9c6aa5df765ceda67087de779c5074af99af476b5806b5cfd20f0',
  '02': '01a5d63075424f1901e16888cd763af9b63f8bdb07c68fd147943b79e9a9381a',
  '03a': 'cdcaf2ab04665b4c6499dc04f7222f14dd87daf7bc6bb11192a73b7a366518e5',
  '03b': '7df55170ae235ccb91782c06b4e5f9fa97b5de93c8fc63983a5401afe1f5be98',
  '03c': 'ebb05f690a54f773cc4fb54e910534386db93a46120a32f9d9047abbdf10eb8d',
  '04': '5bac77bf5319050aaa14fb916b52c0b3a33a1ff67d2d10a4adddad41bded5e72',
  '05': '0b6bbc23db255aeaab7da3ba5fa5dbf434977ab798488aed63b3e9b7e17730a4',
  '06a': '79b5e807c4bdfe73f912de74f08d9f71230911160f0e6593652ed6f1e5186176',
  '06b': '14dad1bbbbeb0823b65d06af9e9597cd7e61710ab9e319bee3d533cfb3db80e1',
  '06c': '4cf68404aa372cac9b75cd671e2494f7fd0c7854f64250ae86f71f1987e985a7',
  '07': '9366fa673b6614948aa3688d52390e63ef1c0a29f5164576df0f17c9d0261d1c',
  '08': '04f5bfc13676a7cd87a5b49fdc72f3864b9aad536a968783ad812b8e37149adf',
  '09': '1e4de687c74e6024204b5c1f1076abd9acfdfe7c54a4ca09902bd817c0c7e656',
  '10': '9c46c6dcb5cf280f6b9105d438af34b309d8db353f9a83e894af91e0b1a08066',
  '11': 'a39835c148804411170f5ef7ba6597da519b0061a363f4af2b3ccb4b958f0e88',
  '12': 'f73420e7b87c93932654975b458611ef31c261cc5f746ab332b11603c5bc479b',
  '13': '3d95e59438aa358abff2c3efbfb945370c577b898b7e69a33dbc55fdb3162cbc',
};

const linhasDiag = ['patch: ' + new Date().toISOString()];
const anota = t => { linhasDiag.push('  ' + t); console.log('[patch] ' + t); };
const gravarDiag = async () => {
  const txt = linhasDiag.join('\n') + '\n';
  if (await access(DIAG).then(() => true, () => false)) await appendFile(DIAG, txt);
  else await writeFile(DIAG, txt);
};
const desistir = async motivo => {
  anota('RESULTADO: patch NAO aplicado — design do repo mantido');
  anota('motivo: ' + motivo);
  await gravarDiag();
  process.exit(0);
};

const nomes = Object.keys(ASSINATURAS);
let b64 = '';
try {
  const existentes = (await readdir(DIR)).filter(f => f.endsWith('.b64')).map(f => f.replace('.b64', ''));
  const faltando = nomes.filter(n => !existentes.includes(n));
  const sobrando = existentes.filter(n => !nomes.includes(n));
  anota('pedacos esperados: ' + nomes.length + ' | encontrados: ' + existentes.length + (sobrando.length ? ' (ignorados: ' + sobrando.join(', ') + ')' : ''));
  if (faltando.length) await desistir('pedacos ausentes: ' + faltando.join(', '));
  const ruins = [];
  for (const n of nomes) {
    const t = (await readFile(DIR + '/' + n + '.b64', 'utf8')).replace(/\s+/g, '');
    const s = sha(t);
    if (s !== ASSINATURAS[n]) ruins.push(n + ' (esperado ' + ASSINATURAS[n].slice(0, 12) + ', encontrado ' + s.slice(0, 12) + ', ' + t.length + ' chars)');
    b64 += t;
  }
  if (ruins.length) await desistir('pedacos corrompidos -> ' + ruins.join(' ; '));
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

const atual = await readFile(ALVO, 'utf8');
const shaAtual = sha(atual);

if (shaAtual === cab.alvo_sha256) {
  anota('design ja esta na versao alvo (' + atual.length + ' bytes) — nada a fazer');
  await gravarDiag();
  process.exit(0);
}
if (shaAtual !== cab.base_sha256) {
  await desistir('a copia do repo nao e a base esperada (tem ' + shaAtual.slice(0, 12) + '/' + atual.length + ' bytes, patch espera ' + cab.base_sha256.slice(0, 12) + '/' + cab.base_bytes + ' bytes)');
}
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
if (shaSaida !== cab.alvo_sha256) await desistir('resultado divergiu do alvo (' + shaSaida.slice(0, 12) + '/' + saida.length + ' bytes, esperado ' + cab.alvo_sha256.slice(0, 12) + '/' + cab.alvo_bytes + ' bytes)');

await writeFile(ALVO, saida);
anota('RESULTADO: design atualizado — ' + partes.length + ' partes, ' + saida.length + ' bytes (sha256 confere)');
await gravarDiag();

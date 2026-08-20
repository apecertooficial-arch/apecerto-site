// Barreira de sanidade: confere se o design que entrou no dist e o aprovado, e nao
// uma copia antiga. Nao derruba o build (o site precisa continuar no ar); registra
// o resultado em DIAGNOSTICO.txt, publicado em /diagnostico.txt, e o selo
// <meta name="apecerto-design"> diz qual versao foi publicada.
import { readFile, writeFile, appendFile, access } from 'node:fs/promises';

const DIAG = 'DIAGNOSTICO.txt';
const OBRIGATORIOS = [
  ['rota da campanha', 'cadastre-seu-imovel'],
  ['tela de boas-vindas', 'Cadastrar meu ap'],
  ['conta criada no fim do cadastro', 'Crie seu acesso'],
  ['painel com linha do tempo', 'checkPainelDemo'],
  ['whatsapp oficial', '11980154312'],
];

const html = await readFile('dist/index.html', 'utf8');
const faltando = OBRIGATORIOS.filter(([, marca]) => !html.includes(marca));
const linhas = [''];

if (faltando.length) {
  linhas.push('VERIFICA: o design publicado NAO tem a versao nova. Faltam:');
  for (const [nome, marca] of faltando) linhas.push('  - ' + nome + ' (marcador "' + marca + '")');
  console.warn(linhas.join('\n'));
} else {
  linhas.push('VERIFICA: design novo publicado — ' + OBRIGATORIOS.length + ' marcadores presentes, ' + html.length + ' bytes');
  console.log(linhas[1]);
}

const existe = await access(DIAG).then(() => true, () => false);
if (existe) await appendFile(DIAG, linhas.join('\n') + '\n');
else await writeFile(DIAG, linhas.join('\n') + '\n');

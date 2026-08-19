// Barreira de sanidade: confere se o design que entrou no dist e realmente o
// aprovado, e nao uma copia antiga. Sem isso o build publica em silencio a
// versao anterior quando o download do payload falha.
import { readFile } from 'node:fs/promises';

const OBRIGATORIOS = [
  ['rota da campanha', 'cadastre-seu-imovel'],
  ['tela de boas-vindas', 'Cadastrar meu ap'],
  ['conta criada no fim do cadastro', 'Crie seu acesso'],
  ['painel com linha do tempo', 'checkPainelDemo'],
  ['whatsapp oficial', '11980154312'],
];

const html = await readFile('dist/index.html', 'utf8');
const faltando = OBRIGATORIOS.filter(([, marca]) => !html.includes(marca));

if (faltando.length) {
  console.error('\nO design que entrou no build esta desatualizado. Faltam:');
  for (const [nome, marca] of faltando) console.error('  - ' + nome + ' (marcador "' + marca + '")');
  console.error('\nQuase sempre isso quer dizer que o link do design-payload.json expirou');
  console.error('e o apply-payload nao substituiu design/Site ApeCerto.dc.html.');
  console.error('Gere um link novo no projeto de design e faca push do payload de novo.\n');
  process.exit(1);
}

console.log('design conferido:', OBRIGATORIOS.length, 'marcadores presentes,', html.length, 'bytes');

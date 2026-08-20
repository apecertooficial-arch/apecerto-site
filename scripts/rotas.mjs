// Publica a area do proprietario em caminhos proprios, servindo o MESMO bundle
// gerado em dist/index.html, com head (title / canonical / og / description)
// ajustado por rota. Roda depois de scripts/build-site.mjs.
//
//   /proprietario/                        -> area logada do proprietario
//   /proprietario/cadastre-seu-imovel/    -> destino das campanhas de captacao
//
// O roteamento em si vive no design (checkRota le location.pathname).
// Injeta <meta name="apecerto-design"> com o sha256 curto do design que entrou no
// build e publica DIAGNOSTICO.txt em /diagnostico.txt, pra dar pra conferir de fora
// qual versao esta no ar e, se nao for a nova, por que.
import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const base = await readFile('dist/index.html', 'utf8');
const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
const selo = createHash('sha256').update(Buffer.from(design, 'utf8')).digest('hex').slice(0, 12);

const TITULO = '<title>ApeCerto | Apartamentos em Moema</title>';
const CANONICAL = '<link rel="canonical" href="https://apecerto.com/">';
const OG_URL = '<meta property="og:url" content="https://apecerto.com/">';
const OG_TITULO = '<meta property="og:title" content="ApeCerto | Apartamentos em Moema">';
const DESC = '<meta name="description" content="Apartamentos para comprar em Moema e região, com curadoria local, atendimento digital 24 horas e visitas agendadas pela ApeCerto.">';
const OG_DESC = '<meta property="og:description" content="Curadoria local de apartamentos em Moema e região. Fale com a ApeCerto e agende sua visita.">';

const rotas = [
  {
    dir: 'dist/proprietario',
    url: 'https://apecerto.com/proprietario/',
    titulo: 'Área do proprietário | ApeCerto',
    desc: 'Acompanhe seu imóvel na ApeCerto: status do anúncio, visitas, propostas e contato direto com o broker.',
  },
  {
    dir: 'dist/proprietario/cadastre-seu-imovel',
    url: 'https://apecerto.com/proprietario/cadastre-seu-imovel/',
    titulo: 'Cadastre seu imóvel | ApeCerto',
    desc: 'Cadastre seu apartamento em 3 minutos. A ApeCerto avalia, fotografa, anuncia e cuida das visitas e do contrato.',
    source: 'dist/avaliacao-imovel-moema/index.html',
  },
];

const troca = (txt, de, para) => {
  if (!txt.includes(de)) throw new Error('trecho ausente no dist/index.html: ' + de.slice(0, 48));
  return txt.replace(de, para);
};

const selar = txt => troca(txt, '<meta name="theme-color" content="#FF7000">', '<meta name="theme-color" content="#FF7000">\n  <meta name="apecerto-design" content="' + selo + '">');

await writeFile('dist/index.html', selar(base));

for (const r of rotas) {
  if (r.source) {
    let html = await readFile(r.source, 'utf8');
    html = html
      .replace(/<title>[^<]*<\/title>/, '<title>' + r.titulo + '</title>')
      .replace(/<link rel="canonical" href="[^"]+">/, '<link rel="canonical" href="' + r.url + '">')
      .replace(/<meta name="description" content="[^"]+">/, '<meta name="description" content="' + r.desc + '">');
    await mkdir(r.dir, { recursive: true });
    await writeFile(r.dir + '/index.html', html);
    console.log('landing de campanha publicada:', r.dir + '/index.html', html.length, 'bytes');
    continue;
  }
  let html = base;
  html = troca(html, TITULO, '<title>' + r.titulo + '</title>');
  html = troca(html, CANONICAL, '<link rel="canonical" href="' + r.url + '">');
  html = troca(html, OG_URL, '<meta property="og:url" content="' + r.url + '">');
  html = troca(html, OG_TITULO, '<meta property="og:title" content="' + r.titulo + '">');
  html = troca(html, DESC, '<meta name="description" content="' + r.desc + '">');
  html = troca(html, OG_DESC, '<meta property="og:description" content="' + r.desc + '">');
  html = selar(html);
  await mkdir(r.dir, { recursive: true });
  await writeFile(r.dir + '/index.html', html);
  console.log('rota publicada:', r.dir + '/index.html', html.length, 'bytes');
}

if (await access('DIAGNOSTICO.txt').then(() => true, () => false)) {
  await copyFile('DIAGNOSTICO.txt', 'dist/diagnostico.txt');
  console.log('diagnostico publicado em /diagnostico.txt');
}

console.log('selo do design:', selo);

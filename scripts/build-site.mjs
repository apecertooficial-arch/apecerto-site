// Gera dist/index.html injetando design/Site ApeCerto.dc.html no pacote-base (index.html).
// Se existir design-payload.json na raiz, baixa antes os arquivos listados. O servidor de
// arquivos injeta tags <style/script data-omelette-injected> e quebras de linha no HTML
// servido; removemos as tags e aceitamos diferenca residual de ate 8 bytes, desde que os
// marcadores obrigatorios estejam presentes.
import { readFile, writeFile, mkdir, access, cp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

const existe = p => access(p).then(() => true, () => false);
const limpaInjecao = txt => txt.replace(/<(style|script)[^>]*data-omelette-injected[^>]*>[\s\S]*?<\/\1>/g, '');

if (await existe('design-payload.json')) {
  const { files } = JSON.parse(await readFile('design-payload.json', 'utf8'));
  for (const f of files) {
    try {
      const r = await fetch(f.url, { redirect: 'follow' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const bruto = Buffer.from(await r.arrayBuffer()).toString('utf8');
      const txt = limpaInjecao(bruto);
      const buf = Buffer.from(txt, 'utf8');
      const sha = createHash('sha256').update(buf).digest('hex');
      const shaOk = sha === f.sha256;
      const lenOk = f.bytes ? Math.abs(buf.length - f.bytes) <= 8 : false;
      const marksOk = (f.mustContain || []).every(m => txt.includes(m));
      if (!shaOk && !(lenOk && marksOk)) {
        console.warn('DEBUG', f.path, '-> bytes pos-limpeza:', buf.length, '(esperado', f.bytes + ')', '| sha:', sha, '| head:', JSON.stringify(txt.slice(0, 160)));
        throw new Error('conteudo nao confere (sha ' + sha.slice(0, 12) + ', ' + buf.length + ' bytes)');
      }
      await mkdir(dirname(f.path) || '.', { recursive: true });
      await writeFile(f.path, buf);
      console.log('payload ok:', f.path, buf.length, 'bytes', shaOk ? '(sha256)' : '(tamanho+marcadores)');
    } catch (e) {
      if (await existe(f.path)) console.warn('payload falhou pra', f.path, '- usando a copia do repo (' + e.message + ')');
      else throw new Error('payload falhou pra ' + f.path + ' e nao ha copia no repo: ' + e.message);
    }
  }
}

const base = await readFile('index.html', 'utf8');
let design = await readFile('design/Site ApeCerto.dc.html', 'utf8');

// Camada de producao aplicada depois do payload externo. Isso evita que dados de
// contato, tracking e afirmacoes institucionais voltem ao estado de prototipo no
// proximo deploy.
const trocaObrigatoria = (texto, de, para, rotulo) => {
  if (!texto.includes(de)) throw new Error('trecho obrigatorio ausente: ' + rotulo);
  return texto.replace(de, para);
};

const productionHead = `
  <meta name="description" content="Apartamentos para comprar em Moema e região, com curadoria local, atendimento digital 24 horas e visitas agendadas pela ApeCerto.">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <meta name="theme-color" content="#FF7000">
  <link rel="canonical" href="https://apecerto.com/">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:title" content="ApeCerto | Apartamentos em Moema">
  <meta property="og:description" content="Curadoria local de apartamentos em Moema e região. Fale com a ApeCerto e agende sua visita.">
  <meta property="og:url" content="https://apecerto.com/">
  <meta property="og:site_name" content="ApeCerto">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"RealEstateAgent","name":"ApeCerto","url":"https://apecerto.com/","telephone":"+55 11 98015-4312","email":"contato@apecerto.com","address":{"@type":"PostalAddress","streetAddress":"Avenida Iraí, 79, conjunto 95A","addressLocality":"São Paulo","addressRegion":"SP","addressCountry":"BR"},"areaServed":["Moema","Campo Belo","Vila Nova Conceição","Brooklin","Planalto Paulista"]}</script>
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-524TZP8X');</script>
  <link rel="stylesheet" href="/assets/production.css">
  <script src="/assets/analytics.js" defer></script>`;

design = trocaObrigatoria(design, '<html><head>', '<html lang="pt-BR"><head>', 'idioma do design');
design = trocaObrigatoria(
  design,
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>ApeCerto | Apartamentos em Moema</title>' + productionHead,
  'SEO e tracking do design',
);
design = trocaObrigatoria(
  design,
  '<body>',
  '<body>\n<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-524TZP8X" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>',
  'noscript do Tag Manager',
);

design = trocaObrigatoria(
  design,
  '&quot;whatsappNumero&quot;: {&quot;editor&quot;: &quot;text&quot;, &quot;default&quot;: &quot;&quot;',
  '&quot;whatsappNumero&quot;: {&quot;editor&quot;: &quot;text&quot;, &quot;default&quot;: &quot;11980154312&quot;',
  'WhatsApp oficial',
);
design = trocaObrigatoria(design, '>+950</div>', '>24h</div>', 'metrica 24h');
design = trocaObrigatoria(design, '>chaves entregues</div>', '>atendimento digital</div>', 'legenda atendimento');
design = trocaObrigatoria(design, '>4,9</div>', '>Moema</div>', 'metrica Moema');
design = trocaObrigatoria(design, '>nota média no Google</div>', '>especialistas na região</div>', 'legenda Moema');
design = trocaObrigatoria(
  design,
  '© 2026 apêcerto imóveis ltda · CRECI-SP 00000-J · CNPJ 00.000.000/0001-00',
  '© 2026 apêcerto imóveis · Av. Iraí, 79, conjunto 95A',
  'rodape institucional',
);

design = trocaObrigatoria(
  design,
  '  abrirDetalhe(r) {\n    this.lead = {};',
  `  abrirDetalhe(r) {\n    if (window.apecertoTrack) window.apecertoTrack('view_item', { item_id: String(r.id || ''), item_name: r.nome || '', bairro: r.bairro || '', value: this.precoDe(r), currency: 'BRL' });\n    this.lead = {};`,
  'evento view_item',
);
design = trocaObrigatoria(
  design,
  '      this.lead = {};\n      this.setState({ leadEnviando: false, leadOk: true });',
  `      if (window.apecertoTrack) window.apecertoTrack('generate_lead', { lead_type: 'comprador', item_id: String(det.id || ''), item_name: det.nome || '' });\n      this.lead = {};\n      this.setState({ leadEnviando: false, leadOk: true });`,
  'evento lead comprador',
);
design = trocaObrigatoria(
  design,
  '      this.fotosArq = []; this.fotosExist = []; this.form = {};',
  `      if (window.apecertoTrack) window.apecertoTrack('generate_lead', { lead_type: 'proprietario', finalidade: f.finalidade || '' });\n      this.fotosArq = []; this.fotosExist = []; this.form = {};`,
  'evento lead proprietario',
);
design = trocaObrigatoria(
  design,
  "      abrePortal: (e) => { if (e && e.preventDefault) e.preventDefault(); const s = this.state.sess;",
  "      abrePortal: (e) => { if (e && e.preventDefault) e.preventDefault(); if (window.apecertoTrack) window.apecertoTrack('owner_portal_open', { source: 'site' }); const s = this.state.sess;",
  'evento portal proprietario',
);

const MARK = '<script type="__bundler/template">';
const s = base.indexOf(MARK);
if (s < 0) throw new Error('bloco __bundler/template nao encontrado no index.html');
const contentStart = base.indexOf('\n', s) + 1;
const end = base.indexOf('</scr' + 'ipt>', contentStart);
if (end < 0) throw new Error('fim do bloco __bundler/template nao encontrado');

const encoded = JSON.stringify(design).replace(/<\//g, '<\\u002F');
let out = base.slice(0, contentStart) + encoded + '\n  ' + base.slice(end);

out = trocaObrigatoria(out, '<html>', '<html lang="pt-BR">', 'idioma do documento');
out = trocaObrigatoria(out, '<title>Bundled Page</title>', '<title>ApeCerto | Apartamentos em Moema</title><meta name="viewport" content="width=device-width, initial-scale=1">' + productionHead, 'SEO do head');

await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', out);
if (await existe('static')) await cp('static', 'dist', { recursive: true });
console.log('dist/index.html gerado:', out.length, 'bytes');

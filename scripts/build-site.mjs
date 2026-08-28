// Gera dist/index.html usando exclusivamente fontes versionadas no repositorio.
// Downloads e payloads temporarios nao fazem parte do build de producao: uma mesma
// revisao deve sempre gerar o mesmo site, mesmo sem acesso a rede.
import { readFile, writeFile, mkdir, access, cp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import vm from 'node:vm';

const existe = p => access(p).then(() => true, () => false);

const base = await readFile('index.html', 'utf8');
let design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
const productionCss = await readFile('static/assets/production.css', 'utf8');
const heroVariants = JSON.parse(await readFile('build-assets/hero-variants.json', 'utf8'));
const optimizedBundleAssets = JSON.parse(await readFile('build-assets/bundle-optimized.json', 'utf8'));
const embeddedAssets = new Map();
const LUCIDE_UUID = 'd76081c9-365b-497c-a53c-e3f94767ebc9';

// O arquivo recebido do Cloud Design traz os mais de 1.700 ícones do Lucide,
// embora esta interface use apenas algumas dezenas. Mantemos o mesmo UUID
// esperado pelo runtime e publicamos uma implementação compatível contendo só
// os desenhos realmente referenciados pelo template.
const criarLucideMinimo = bytes => {
  const nomes = new Set([
    ...[...design.matchAll(/data-lucide="([^"{}]+)"/g)].map(match => match[1]),
    ...[...design.matchAll(/\bic:\s*['"]([^'"]+)['"]/g)].map(match => match[1]),
  ]);
  const paraPascal = nome => nome.split('-').filter(Boolean).map(parte => parte[0].toUpperCase() + parte.slice(1)).join('');
  const sandbox = {};
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  const context = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  new vm.Script(bytes.toString('utf8'), { filename: 'lucide-v0.462.0.js' }).runInContext(context, { timeout: 1000 });
  if (!sandbox.lucide || !sandbox.lucide.icons) throw new Error('pacote Lucide inválido');
  const icons = {};
  for (const nome of [...nomes].sort()) {
    const desenho = sandbox.lucide.icons[paraPascal(nome)];
    if (!desenho) throw new Error('ícone Lucide ausente: ' + nome);
    icons[nome] = desenho;
  }
  const runtime = `/*! @license lucide v0.462.0 - ISC | subset ApeCerto */
(function(g){"use strict";var icons=${JSON.stringify(icons)};var ns="http://www.w3.org/2000/svg";function make(def){var el=document.createElementNS(ns,def[0]),attrs=def[1]||{},kids=def[2]||[];Object.keys(attrs).forEach(function(k){el.setAttribute(k,String(attrs[k]))});kids.forEach(function(k){el.appendChild(make(k))});return el}function createIcons(){document.querySelectorAll("[data-lucide]").forEach(function(old){var name=old.getAttribute("data-lucide"),def=icons[name];if(!def)return;var svg=make(def),classes=["lucide","lucide-"+name,old.getAttribute("class")||""].filter(Boolean).join(" ");Array.from(old.attributes).forEach(function(a){if(a.name!=="data-lucide"&&a.name!=="class")svg.setAttribute(a.name,a.value)});svg.setAttribute("class",classes);if(!svg.hasAttribute("aria-label")&&!svg.hasAttribute("aria-hidden"))svg.setAttribute("aria-hidden","true");old.replaceWith(svg)})}g.lucide={icons:icons,createIcons:createIcons}})(window);`;
  return Buffer.from(runtime);
};

const manifestMatch = base.match(/<script type="__bundler\/manifest">\s*([\s\S]*?)\s*<\/script>/);
if (!manifestMatch) throw new Error('manifesto do pacote-base ausente');
const originalManifest = JSON.parse(manifestMatch[1]);
const extResourcesMatch = base.match(/<script type="__bundler\/ext_resources">\s*([\s\S]*?)\s*<\/script>/);
const extResourceUuids = extResourcesMatch
  ? JSON.parse(extResourcesMatch[1]).map(entry => entry && entry.uuid).filter(Boolean)
  : [];
const bundleManifest = {};
const bundleExtension = mime => ({
  'application/javascript': 'js',
  'text/javascript': 'js',
  'font/ttf': 'ttf',
  'font/woff2': 'woff2',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'text/html': 'html',
})[mime] || 'bin';

for (const [uuid, entry] of Object.entries(originalManifest)) {
  const encoded = Buffer.from(entry.data, 'base64');
  const bytes = entry.compressed ? gunzipSync(encoded) : encoded;
  const sourceHash = createHash('sha256').update(bytes).digest('hex');
  const optimized = optimizedBundleAssets[uuid];
  if (optimized) {
    if (sourceHash !== optimized.sourceSha256) throw new Error('fonte do asset otimizado divergiu: ' + uuid);
    const optimizedBytes = await readFile('static/' + optimized.path.replace(/^\/+/, ''));
    const optimizedHash = createHash('sha256').update(optimizedBytes).digest('hex');
    if (optimizedHash !== optimized.sha256 || optimizedBytes.length !== optimized.bytes) throw new Error('asset otimizado divergiu: ' + uuid);
    bundleManifest[uuid] = { mime: optimized.mime, compressed: false, url: optimized.path };
    continue;
  }
  // O pacote-base referencia mapas de Lucide/Leaflet que não existem no
  // artefato publicado. O comentário não afeta o runtime e sua remoção evita
  // 404 quando auditorias ou DevTools tentam baixar esses arquivos.
  const publishedBytes = uuid === LUCIDE_UUID
    ? criarLucideMinimo(bytes)
    : /(?:application|text)\/javascript/.test(entry.mime)
      ? Buffer.from(bytes.toString('utf8').replace(/\n?\/\/# sourceMappingURL=[^\r\n]+\s*$/gm, ''))
      : bytes;
  const publishedHash = createHash('sha256').update(publishedBytes).digest('hex');
  const relative = 'assets/bundle/' + publishedHash.slice(0, 20) + '.' + bundleExtension(entry.mime);
  embeddedAssets.set(relative, publishedBytes);
  bundleManifest[uuid] = { mime: entry.mime, compressed: false, url: '/' + relative };
}

// Camada de producao aplicada sobre o design versionado. As substituicoes
// obrigatorias falham de forma explicita se a estrutura aprovada mudar.
const trocaObrigatoria = (texto, de, para, rotulo) => {
  if (texto.includes(de)) return texto.replace(de, para);
  if (texto.includes(para)) return texto;
  throw new Error('trecho obrigatorio ausente: ' + rotulo);
};

const trocaBlocoObrigatorio = (texto, inicio, fim, novo, rotulo) => {
  const a = texto.indexOf(inicio);
  const b = a < 0 ? -1 : texto.indexOf(fim, a + inicio.length);
  if (a < 0 || b < 0) throw new Error('bloco obrigatorio ausente: ' + rotulo);
  return texto.slice(0, a) + novo + texto.slice(b);
};

const formatosFonteTtf = (design.match(/format\('truetype'\)/g) || []).length;
if (formatosFonteTtf !== 10) throw new Error('contrato de fontes Quicksand mudou: esperados 10 formatos TTF');
design = design.replaceAll("format('truetype')", "format('woff2')");

const productionMetadata = `
  <meta name="description" content="Apartamentos para comprar em Moema e região, com curadoria local, atendimento digital 24 horas e visitas agendadas pela ApeCerto.">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <meta name="theme-color" content="#FF7000">
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="shortcut icon" type="image/svg+xml" href="/favicon.svg">
  <link rel="canonical" href="https://apecerto.com/">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="pt_BR">
  <meta property="og:title" content="ApeCerto | Apartamentos em Moema">
  <meta property="og:description" content="Curadoria local de apartamentos em Moema e região. Fale com a ApeCerto e agende sua visita.">
  <meta property="og:url" content="https://apecerto.com/">
  <meta property="og:site_name" content="ApeCerto">
  <meta property="og:image" content="https://apecerto.com${heroVariants.variants.jpeg_640.path}">
  <meta property="og:image:width" content="640">
  <meta property="og:image:height" content="640">
  <meta property="og:image:alt" content="Sala decorada e iluminada em Moema, referência visual da ApeCerto">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="ApeCerto | Apartamentos em Moema">
  <meta name="twitter:description" content="Curadoria local de apartamentos em Moema e região. Fale com a ApeCerto e agende sua visita.">
  <meta name="twitter:image" content="https://apecerto.com${heroVariants.variants.jpeg_640.path}">
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"RealEstateAgent","name":"ApeCerto","url":"https://apecerto.com/","telephone":"+55 11 98015-4312","email":"contato@apecerto.com","address":{"@type":"PostalAddress","streetAddress":"Avenida Iraí, 79, conjunto 95A","addressLocality":"São Paulo","addressRegion":"SP","addressCountry":"BR"},"areaServed":["Moema","Campo Belo","Vila Nova Conceição","Brooklin","Planalto Paulista"]}</script>`;

const productionHead = `${productionMetadata}
  <style id="apecerto-no-bundle-splash">#__bundler_loading,#__bundler_thumbnail{display:none!important}</style>
  <style id="apecerto-production-css">${productionCss}</style>
  <script id="apecerto-recovery-scrub">(function(){try{var p=new URLSearchParams(String(location.hash||'').replace(/^#/,''));var t=p.get('type');var a=p.get('access_token');var e=p.get('error_description');if((a&&t==='recovery')||e){Object.defineProperty(window,'__APECERTO_RECOVERY__',{value:{type:t,access_token:a,error_description:e},configurable:true});history.replaceState({},'',location.pathname+location.search)}}catch(_){}})();</script>
  <script>window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};window.gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});</script>
  <script id="apecerto-gtm-deferred">(function(w,d,l,i){w[l]=w[l]||[];function load(){if(w.apecertoGtmLoading||w.apecertoGtmContainerLoaded)return;w.apecertoGtmLoading=true;w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName('script')[0],j=d.createElement('script'),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;j.onload=function(){w.apecertoGtmContainerLoaded=true};j.onerror=function(){w.apecertoGtmLoadFailed=true;if(w.apecertoLoadGoogleFallback)w.apecertoLoadGoogleFallback()};f.parentNode.insertBefore(j,f)}w.apecertoLoadGtm=load;function schedule(){var started=false,start=function(){if(started)return;started=true;['pointerdown','touchstart','keydown'].forEach(function(n){d.removeEventListener(n,start,true)});load()};['pointerdown','touchstart','keydown'].forEach(function(n){d.addEventListener(n,start,{capture:true,once:true,passive:n!=='keydown'})});w.setTimeout(start,12000)}if(d.readyState==='complete')schedule();else w.addEventListener('load',schedule,{once:true})})(window,document,'dataLayer','GTM-524TZP8X');</script>
  <script src="/assets/analytics.js" defer></script>`;

design = trocaObrigatoria(design, '<html><head>', '<html lang="pt-BR"><head>', 'idioma do design');
design = trocaObrigatoria(
  design,
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>ApeCerto | Apartamentos em Moema</title>' + productionMetadata,
  'metadados persistentes do design sem tracking duplicado',
);
const faviconInline = /var ico = 'data:image\/png;base64,[A-Za-z0-9+/=]+';/;
if (!faviconInline.test(design)) throw new Error('favicon inline do design ausente');
design = design.replace(faviconInline, "var ico = '/favicon.svg';");
design = trocaObrigatoria(
  design,
  '<body>',
  '<body>\n<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-524TZP8X" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>',
  'noscript do Tag Manager',
);

design = trocaObrigatoria(
  design,
  `            <div style="height: 170px; position: relative">
              <image-slot id="{{ b.slot }}" shape="rect" placeholder="{{ b.foto }}"></image-slot>
            </div>`,
  `            <a href="#apes" sc-camel-on-click="{{ b.filtrar }}" aria-label="Ver os apês de {{ b.nome }}" data-bairro-image-link="true" style="height: 170px; position: relative; display: block">
              <span class="rw-bairro-visual" data-bairro-visual="{{ b.slot }}" aria-hidden="true" style="display: block; height: 100%; pointer-events: none">
                <svg viewBox="0 0 480 170" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" focusable="false" aria-hidden="true"><path d="M0 134L62 98l48 26 74-68 61 51 56-38 179 84v17H0Z" fill="currentColor" opacity=".09"></path><path d="M42 135V97h70v38m20 0V76h92v59m24 0V101h80v34m20 0V65h86v70" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round" opacity=".34"></path><path d="M27 135h426" stroke="currentColor" stroke-width="4" stroke-linecap="round" opacity=".34"></path><circle cx="382" cy="38" r="15" fill="none" stroke="currentColor" stroke-width="5" opacity=".42"></circle><path d="M397 38h34m-10 0v11m-10-11v8" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" opacity=".42"></path></svg>
              </span>
            </a>`,
  'cards de bairro sem controles editoriais no site publico',
);
design = trocaObrigatoria(
  design,
  '<script src="ff9f78ad-2cb1-45e3-80ee-5aeee257da44"></script>',
  '<!-- runtime image-slot omitido: nenhum controle editorial é publicado -->',
  'runtime de upload removido do site publico',
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
  '  abrirDetalhe(r) {\n    this.lead = {};',
  `  abrirDetalhe(r) {\n    window.apecertoCurrentItem = { id: String(r.id || ''), name: r.nome || '' };\n    if (window.apecertoTrack) window.apecertoTrack('view_item', { item_id: String(r.id || ''), item_name: r.nome || '', bairro: r.bairro || '', value: this.precoDe(r), currency: 'BRL' });\n    this.lead = {};`,
  'evento view_item',
);

design = trocaObrigatoria(
  design,
  '    const setIdx = (e, i) => {\n      if (!galeriaPendente)',
  "    const setIdx = (e, i) => {\n      if (window.apecertoTrack) window.apecertoTrack('gallery_interaction', { item_id: String(r.id || ''), item_name: r.nome || '', action_label: i > idx ? 'Próxima foto' : 'Foto anterior' });\n      if (!galeriaPendente)",
  'galeria do card com contexto do imovel',
);

design = trocaObrigatoria(
  design,
  '        if (favs[r.id]) delete favs[r.id]; else favs[r.id] = true;\n        try { localStorage.setItem(\'apecerto_favs\', JSON.stringify(favs)); } catch (err) {}',
  "        if (favs[r.id]) delete favs[r.id]; else favs[r.id] = true;\n        if (window.apecertoTrack) window.apecertoTrack('favorite_toggle', { item_id: String(r.id || ''), item_name: r.nome || '', status: favs[r.id] ? 'added' : 'removed' });\n        try { localStorage.setItem('apecerto_favs', JSON.stringify(favs)); } catch (err) {}",
  'favorito do card com contexto do imovel',
);

design = trocaObrigatoria(
  design,
  '  fecharDetalhe() {\n    if (this.mapa) { this.mapa.remove(); this.mapa = null; }',
  '  fecharDetalhe() {\n    window.apecertoCurrentItem = null;\n    if (this.mapa) { this.mapa.remove(); this.mapa = null; }',
  'limpeza do contexto do imovel',
);

design = trocaObrigatoria(
  design,
  '      detFavTgl: () => { const d = this.state.det; if (!d) return; const favs = Object.assign({}, this.state.favs); if (favs[d.id]) delete favs[d.id]; else favs[d.id] = true; try { localStorage.setItem(\'apecerto_favs\', JSON.stringify(favs)); } catch (err) {} this.setState({ favs }); },',
  "      detFavTgl: () => { const d = this.state.det; if (!d) return; const favs = Object.assign({}, this.state.favs); if (favs[d.id]) delete favs[d.id]; else favs[d.id] = true; if (window.apecertoTrack) window.apecertoTrack('favorite_toggle', { item_id: String(d.id || ''), item_name: d.nome || '', status: favs[d.id] ? 'added' : 'removed' }); try { localStorage.setItem('apecerto_favs', JSON.stringify(favs)); } catch (err) {} this.setState({ favs }); },",
  'favorito do detalhe com contexto do imovel',
);

design = trocaObrigatoria(
  design,
  '      galPrev: e => this.trocarFotoGaleria(e, fotosDet, (gi - 1 + fotosDet.length) % fotosDet.length),\n      galNext: e => this.trocarFotoGaleria(e, fotosDet, (gi + 1) % fotosDet.length),\n      galThumbs: galThumbsDet.map((foto, pos) => { const i = galThumbInicio + pos; return { url: foto.url, grupo: foto.grupo, label: \'Ver foto \' + (i + 1) + \' de \' + fotosDet.length + \' — \' + foto.grupo, atual: i === gi, sel: e => this.trocarFotoGaleria(e, fotosDet, i), borda: i === gi ? \'var(--ape-orange)\' : \'transparent\', op: i === gi ? \'1\' : \'0.6\' }; }),',
  "      galPrev: e => { if (window.apecertoTrack) window.apecertoTrack('gallery_interaction', { item_id: String(det.id || ''), item_name: det.nome || '', action_label: 'Foto anterior' }); this.trocarFotoGaleria(e, fotosDet, (gi - 1 + fotosDet.length) % fotosDet.length); },\n      galNext: e => { if (window.apecertoTrack) window.apecertoTrack('gallery_interaction', { item_id: String(det.id || ''), item_name: det.nome || '', action_label: 'Próxima foto' }); this.trocarFotoGaleria(e, fotosDet, (gi + 1) % fotosDet.length); },\n      galThumbs: galThumbsDet.map((foto, pos) => { const i = galThumbInicio + pos; return { url: foto.url, grupo: foto.grupo, label: 'Ver foto ' + (i + 1) + ' de ' + fotosDet.length + ' — ' + foto.grupo, atual: i === gi, sel: e => { if (window.apecertoTrack) window.apecertoTrack('gallery_interaction', { item_id: String(det.id || ''), item_name: det.nome || '', action_label: 'Miniatura ' + (i + 1) }); this.trocarFotoGaleria(e, fotosDet, i); }, borda: i === gi ? 'var(--ape-orange)' : 'transparent', op: i === gi ? '1' : '0.6' }; }),",
  'galeria do detalhe com contexto do imovel',
);

design = trocaObrigatoria(
  design,
  '        sel: ok ? () => this.setState({ leadDia: val, calOn: false }) : () => {}',
  "        sel: ok ? () => { if (window.apecertoTrack) window.apecertoTrack('schedule_field_select', { field_name: 'date', item_id: String((this.state.det || {}).id || ''), item_name: (this.state.det || {}).nome || '' }); this.setState({ leadDia: val, calOn: false }); } : () => {}",
  'selecao de data do agendamento',
);

design = trocaObrigatoria(
  design,
  "      leadHoras: (() => { const hs = []; for (let h = 8; h <= 19; h++) { hs.push(String(h).padStart(2, '0') + ':00'); if (h < 19) hs.push(String(h).padStart(2, '0') + ':30'); } return hs; })().map(h => ({ label: h, sel: () => this.setState({ leadHora: h, horaOn: false }),",
  "      leadHoras: (() => { const hs = []; for (let h = 8; h <= 19; h++) { hs.push(String(h).padStart(2, '0') + ':00'); if (h < 19) hs.push(String(h).padStart(2, '0') + ':30'); } return hs; })().map(h => ({ label: h, sel: () => { if (window.apecertoTrack) window.apecertoTrack('schedule_field_select', { field_name: 'time', item_id: String((this.state.det || {}).id || ''), item_name: (this.state.det || {}).nome || '' }); this.setState({ leadHora: h, horaOn: false }); },",
  'selecao de horario do agendamento',
);

design = trocaObrigatoria(
  design,
  '<div data-lead-form="" sc-camel-on-input="{{ leadInput }}" style="display: flex; flex-direction: column; gap: 10px; border-top:',
  '<div data-lead-form="" data-tracking-form="agendamento" sc-camel-on-input="{{ leadInput }}" style="display: flex; flex-direction: column; gap: 10px; border-top:',
  'contexto do formulario de agendamento',
);

design = trocaObrigatoria(
  design,
  '<div sc-camel-on-input="{{ finInput }}" style="display: flex">',
  '<div data-tracking-context="financiamento" sc-camel-on-input="{{ finInput }}" style="display: flex">',
  'contexto do slider de financiamento',
);

design = trocaObrigatoria(
  design,
  '<div sc-camel-on-input="{{ fichaInput }}" style="display: flex; flex-direction: column; gap: 14px">',
  '<div data-tracking-form="financiamento" sc-camel-on-input="{{ fichaInput }}" style="display: flex; flex-direction: column; gap: 14px">',
  'contexto do formulario de financiamento',
);

design = trocaObrigatoria(
  design,
  '<div sc-camel-on-input="{{ formInput }}" sc-camel-on-change="{{ formInput }}" style="background:',
  '<div data-tracking-form="proprietario" sc-camel-on-input="{{ formInput }}" sc-camel-on-change="{{ formInput }}" style="background:',
  'contexto do formulario de proprietario',
);
design = trocaObrigatoria(
  design,
  '      this.lead = {};\n      this.setState({ leadEnviando: false, leadOk: true });',
  `      if (window.apecertoTrack) window.apecertoTrack('generate_lead', { lead_type: 'comprador', item_id: String(det.id || ''), item_name: det.nome || '', __identity: { email: l.email || '', phone: l.telefone || '' } });\n      this.lead = {};\n      this.setState({ leadEnviando: false, leadOk: true });`,
  'evento lead comprador',
);
design = trocaObrigatoria(
  design,
  "      const payload = { empreendimento_id: det.id, empreendimento_nome: det.nome, nome: l.nome, telefone: l.telefone, email: l.email || null, preferencia_horario: pref };",
  "      const tracking = window.apecertoLeadTracking ? window.apecertoLeadTracking() : null;\n      const payload = Object.assign({ empreendimento_id: det.id, empreendimento_nome: det.nome, nome: l.nome, telefone: l.telefone, email: l.email || null, preferencia_horario: pref }, tracking ? { page_view_id: tracking.page_view_id, tracking: tracking } : {});",
  'atribuicao do lead comprador ao CRM',
);
design = trocaObrigatoria(
  design,
  '      this.fotosArq = []; this.fotosExist = []; this.form = {};',
  `      if (window.apecertoTrack) window.apecertoTrack('generate_lead', { lead_type: 'proprietario', finalidade: f.finalidade || '', __identity: { email: f.email || '', phone: f.telefone || '' } });\n      this.fotosArq = []; this.fotosExist = []; this.form = {};`,
  'evento lead proprietario',
);
design = trocaObrigatoria(
  design,
  '        acesso_instrucoes: f.acesso_instrucoes || null, fotos: paths, termo_aceite: true\n      };',
  "        acesso_instrucoes: f.acesso_instrucoes || null, fotos: paths, termo_aceite: true\n      };\n      const tracking = window.apecertoLeadTracking ? window.apecertoLeadTracking() : null;\n      if (tracking) { payload.page_view_id = tracking.page_view_id; payload.tracking = tracking; }",
  'atribuicao da captacao de proprietario',
);
design = trocaObrigatoria(
  design,
  "  abrirRotaProprietario(cadastro, e) {\n    if (e && e.preventDefault) e.preventDefault();",
  "  abrirRotaProprietario(cadastro, e) {\n    if (e && e.preventDefault) e.preventDefault();\n    if (window.apecertoTrack) window.apecertoTrack('owner_portal_open', { source: cadastro ? 'cadastro_imovel' : 'portal' });",
  'evento portal proprietario',
);

const buyerLeadProductionMethod = `  async leadEnviar() {
    if (this.state.leadEnviando) return;
    const l = this.lead, det = this.state.det;
    if (!l.nome || !l.telefone || !l.email) return this.setState({ leadErro: 'Nome, WhatsApp e e-mail são obrigatórios — é como a gente confirma a visita.' });
    this.setState({ leadEnviando: true, leadErro: null });
    try {
      if (!window.apecertoSubmitSiteLead) throw new Error('tracking_unavailable');
      const pref = [this.state.leadDia, this.state.leadHora].filter(Boolean).join(' às ') || null;
      const empreendimentoId = this.empreendimentoId(det);
      const unidadeId = this.unidadeId(det);
      await window.apecertoSubmitSiteLead({
        lead_type: 'comprador',
        empreendimento_id: empreendimentoId,
        unidade_id: unidadeId,
        empreendimento_nome: det.nome,
        preferencia_horario: pref,
        nome: l.nome,
        telefone: l.telefone,
        email: l.email || null,
        context: {
          empreendimento_id: empreendimentoId,
          unidade_id: unidadeId,
          empreendimento_nome: det.nome,
          preferencia_horario: pref,
          source: 'property_detail'
        }
      });
      if (window.apecertoTrack) {
        const item = { lead_type: 'comprador', item_id: String(det.id || ''), item_name: det.nome || '', __identity: { email: l.email || '', phone: l.telefone || '' } };
        window.apecertoTrack('generate_lead', item);
        if (pref) window.apecertoTrack('schedule_complete', item);
      }
      this.lead = {};
      this.setState({ leadEnviando: false, leadOk: true });
    } catch (e) { this.registrarErro('lead_comprador', e); this.setState({ leadEnviando: false, leadErro: 'Não deu certo agora — tenta de novo ou chama no WhatsApp.' }); }
  }
`;

design = trocaBlocoObrigatorio(design, '  async leadEnviar() {', '  async compartilhar() {', buyerLeadProductionMethod, 'lead comprador unificado no CRM');

const financeProductionForm = `          <div data-tracking-form="financiamento" sc-camel-on-input="{{ fichaInput }}" style="display: flex; flex-direction: column; gap: 14px">
            <div style="background: var(--bg-sunken); border-radius: var(--radius-md); padding: 14px 16px; display: flex; flex-wrap: wrap; gap: 8px 24px; font-size: var(--text-sm)">
              <span style="color: var(--fg-3)">Imóvel: <strong style="color: var(--fg-1)">{{ fichaImovel }}</strong></span>
              <span style="color: var(--fg-3)">Entrada ({{ finEntradaPct }}): <strong style="color: var(--fg-1)">{{ finEntrada }}</strong></span>
              <span style="color: var(--fg-3)">A financiar ({{ finPctLabel }}): <strong style="color: var(--ape-orange)">{{ finFinanciar }}</strong></span>
            </div>
            <div style="background: var(--success-bg); color: var(--success); border-radius: var(--radius-md); padding: 10px 14px; font-size: var(--text-sm)">Nesta etapa pedimos apenas os dados necessários para o contato. CPF, RG e documentos serão solicitados pela equipe somente se você decidir avançar.</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px">
              <div style="display: flex; flex-direction: column; gap: 6px; grid-column: 1 / -1">
                <label for="financing-nome" style="font-size: var(--text-xs); font-weight: var(--weight-semibold); color: var(--fg-3)">Nome completo *</label>
                <input id="financing-nome" name="nome" autocomplete="name" required="" aria-required="true" placeholder="Seu nome" style="width: 100%; box-sizing: border-box; border: 1px solid var(--border-default); border-radius: 12px; height: 44px; padding: 0 14px; font-family: var(--font-body); font-size: var(--text-sm); color: var(--fg-1); background: var(--bg-surface); outline: none">
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px">
                <label for="financing-telefone" style="font-size: var(--text-xs); font-weight: var(--weight-semibold); color: var(--fg-3)">Telefone / WhatsApp *</label>
                <input id="financing-telefone" name="telefone" type="tel" inputmode="tel" autocomplete="tel" required="" aria-required="true" placeholder="(11) 99999-9999" style="width: 100%; box-sizing: border-box; border: 1px solid var(--border-default); border-radius: 12px; height: 44px; padding: 0 14px; font-family: var(--font-body); font-size: var(--text-sm); color: var(--fg-1); background: var(--bg-surface); outline: none">
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px">
                <label for="financing-email" style="font-size: var(--text-xs); font-weight: var(--weight-semibold); color: var(--fg-3)">E-mail *</label>
                <input id="financing-email" name="email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" required="" aria-required="true" placeholder="voce@email.com" style="width: 100%; box-sizing: border-box; border: 1px solid var(--border-default); border-radius: 12px; height: 44px; padding: 0 14px; font-family: var(--font-body); font-size: var(--text-sm); color: var(--fg-1); background: var(--bg-surface); outline: none">
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px; grid-column: 1 / -1">
                <label for="financing-renda" style="font-size: var(--text-xs); font-weight: var(--weight-semibold); color: var(--fg-3)">Renda mensal aproximada *</label>
                <input id="financing-renda" name="renda" inputmode="numeric" required="" aria-required="true" placeholder="R$" style="width: 100%; box-sizing: border-box; border: 1px solid var(--border-default); border-radius: 12px; height: 44px; padding: 0 14px; font-family: var(--font-body); font-size: var(--text-sm); color: var(--fg-1); background: var(--bg-surface); outline: none">
              </div>
            </div>
`;

design = trocaBlocoObrigatorio(
  design,
  '          <div data-tracking-form="financiamento" sc-camel-on-input="{{ fichaInput }}" style="display: flex; flex-direction: column; gap: 14px">',
  '            <sc-if value="{{ fichaErro }}" hint-placeholder-val="{{ false }}">',
  financeProductionForm,
  'formulario financeiro minimizado',
);

const financeLeadProductionMethod = `  async fichaEnviar() {
    if (this.fichaSubmitInFlight || this.state.fichaEnviando || this.state.fichaOk) return;
    this.fichaSubmitInFlight = true;
    const f = this.ficha, det = this.state.det, st = this.state;
    const itemId = det ? String(det.id || '') : '';
    const itemName = det ? det.nome || '' : '';
    const trackingBase = { form_context: 'financiamento', item_id: itemId, item_name: itemName };
    const nome = String(f.nome || '').trim();
    const telefone = String(f.telefone || '').trim();
    const email = String(f.email || '').trim();
    const telefoneDigitos = telefone.replace(/\\D/g, '');
    const telefoneValido = /^[1-9][0-9]{9,10}$/.test(telefoneDigitos) || /^55[1-9][0-9]{9,10}$/.test(telefoneDigitos);
    const rendaMensal = this.num(f.renda);
    const preco = det ? this.precoDe(det) : 0;
    const empreendimentoId = det ? this.empreendimentoId(det) : null;
    const unidadeId = det ? this.unidadeId(det) : null;
    this.setState({ fichaEnviando: true, fichaErro: null });
    try {
      if (window.apecertoTrack) {
        try { await window.apecertoTrack('form_submit_attempt', trackingBase); } catch (trackingError) {}
      }
      if (nome.length < 2 || !telefoneValido || !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
        if (window.apecertoTrack) window.apecertoTrack('form_error', Object.assign({}, trackingBase, { error_type: 'contact_required' }));
        this.setState({ fichaEnviando: false, fichaErro: 'Confira nome, telefone e e-mail para continuar.' });
        return;
      }
      if (!Number.isFinite(rendaMensal) || rendaMensal < 500 || rendaMensal > 10000000) {
        if (window.apecertoTrack) window.apecertoTrack('form_error', Object.assign({}, trackingBase, { error_type: 'income_required' }));
        this.setState({ fichaEnviando: false, fichaErro: 'Informe uma renda mensal válida — pode ser aproximada.' });
        return;
      }
      if (!empreendimentoId) {
        if (window.apecertoTrack) window.apecertoTrack('form_error', Object.assign({}, trackingBase, { error_type: 'item_unavailable' }));
        this.setState({ fichaEnviando: false, fichaErro: 'Este imóvel não está disponível para simulação agora.' });
        return;
      }
      if (!window.apecertoSubmitFinancingLead) {
        if (window.apecertoTrack) window.apecertoTrack('form_error', Object.assign({}, trackingBase, { error_type: 'tracking_unavailable' }));
        throw new Error('tracking_unavailable');
      }
      const persisted = await window.apecertoSubmitFinancingLead({
        empreendimento_id: empreendimentoId,
        unidade_id: unidadeId,
        item_id: itemId,
        item_codigo: det ? det.codigo || det.unidade_codigo || null : null,
        item_name: itemName,
        nome: nome,
        telefone: telefone,
        email: email,
        renda_mensal: rendaMensal,
        percentual_financiado: st.finPct
      });
      if (!persisted || persisted.accepted !== true || !persisted.conversion_event_id) throw new Error('financing_not_persisted');
      if (window.apecertoTrack) await window.apecertoTrack('generate_lead', {
        event_id: persisted.conversion_event_id,
        lead_type: 'financiamento',
        item_id: itemId,
        item_name: itemName,
        value: preco || undefined,
        currency: 'BRL',
        __identity: { email: email, phone: telefone }
      });
      this.ficha = {};
      this.setState({ fichaEnviando: false, fichaOk: true }, () => {
        setTimeout(() => { const confirmacao = document.querySelector('[data-financing-success]'); if (confirmacao && confirmacao.focus) confirmacao.focus(); }, 30);
      });
    } catch (e) {
      this.registrarErro('lead_financiamento', e, e && e.status);
      this.setState({ fichaEnviando: false, fichaErro: 'Não deu certo agora — tenta de novo ou chama a gente no WhatsApp.' });
    } finally {
      this.fichaSubmitInFlight = false;
    }
  }
`;

design = trocaBlocoObrigatorio(design, '  async fichaEnviar() {', '  similares(det) {', financeLeadProductionMethod, 'financiamento unificado no CRM');
design = trocaObrigatoria(
  design,
  '  abrirFicha() {\n    this.fichaFocusOrigin = document.activeElement;',
  "  abrirFicha() {\n    if (this.state.fichaOn || this.fichaSubmitInFlight || this.state.fichaEnviando) return;\n    const det = this.state.det;\n    const itemId = det ? String(det.id || '') : '';\n    const novaIntencao = this.state.fichaOk || (this.fichaRequestItemId && this.fichaRequestItemId !== itemId);\n    if (novaIntencao && window.apecertoResetFinancingLead) window.apecertoResetFinancingLead();\n    this.fichaRequestItemId = itemId;\n    if (window.apecertoTrack) window.apecertoTrack('financing_open', { cta_name: 'simular_financiamento', item_id: itemId, item_name: det ? det.nome || '' : '' });\n    this.fichaFocusOrigin = document.activeElement;",
  'evento abertura do financiamento',
);
design = trocaObrigatoria(
  design,
  '  fecharFicha() {\n    this.setState({ fichaOn: false }, () => {',
  '  fecharFicha() {\n    if (this.fichaSubmitInFlight || this.state.fichaEnviando) return;\n    this.setState({ fichaOn: false }, () => {',
  'guarda de fechamento durante envio do financiamento',
);
design = trocaObrigatoria(design, 'Preenche seus dados e a simulação do financiamento chega no seu e-mail.', 'Informe seus dados de contato e receba a orientação da equipe sobre financiamento.', 'texto seguro do financiamento');
design = trocaObrigatoria(design, 'Ficha enviada!', 'Pedido de simulação enviado!', 'confirmacao do financiamento');

// A busca publica usa uma Edge Function com IA e rate limit. O navegador nunca
// recebe a chave do modelo e a funcao devolve somente IDs da view site_produtos.
const saraProductionMethod = `  async saraBuscar(txt) {
    const pergunta = String(txt || '').trim().slice(0, 240);
    const finalidadeAtual = this.state.fFinalidade || ((this.state.aba || this.props.abaInicial) === 'alugar' ? 'aluguel' : 'venda');
    const msgs = (this.state.saraMsgs || []).concat([{ eu: true, txt: pergunta }]);
    this.setState({ saraMsgs: msgs.concat([{ eu: false, txt: 'Só um instante — estou cruzando seu pedido com os imóveis disponíveis…' }]), saraIds: null, saraEmpreendimentoIds: null });
    if (window.apecertoTrack) window.apecertoTrack('sara_search', { query_length: pergunta.length });
    try {
      let clientId = '';
      try {
        clientId = localStorage.getItem('apecerto_sara_client') || '';
        if (!clientId) {
          clientId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2);
          localStorage.setItem('apecerto_sara_client', clientId);
        }
      } catch (e) {}
      const r = await fetch(this.SB_URL + '/functions/v1/sara-site', {
        method: 'POST',
        headers: { apikey: this.SB_KEY, Authorization: 'Bearer ' + this.SB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta, client_id: clientId, finalidade: finalidadeAtual })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) throw new Error(data.mensagem || data.erro || ('erro ' + r.status));
      const f = data.filters || {};
      const finalidadeSara = f.finalidade === 'aluguel' ? 'aluguel' : 'venda';
      const minD = Number(f.dormitorios_min);
      const maxD = f.dormitorios_max == null ? null : Number(f.dormitorios_max);
      const unidadesSara = data.units && typeof data.units === 'object' ? data.units : {};
      const paisSara = Array.from(new Set(Object.values(unidadesSara).map(u => u && u.empreendimento_id).filter(id => this.uuidValido(id)).map(String)));
      const patch = {
        aba: finalidadeSara === 'aluguel' ? 'alugar' : 'comprar',
        fFinalidade: finalidadeSara,
        fBairro: f.bairro || '',
        fStatus: f.status || '',
        fDorms: Number.isFinite(minD) ? (minD <= 1 && maxD !== null && maxD <= 1 ? 'd1' : minD === 2 && maxD === 2 ? 'd2' : minD >= 3 ? 'd3' : '') : '',
        fVagas: Number(f.vagas_min) >= 2 ? 'v2' : Number(f.vagas_min) >= 1 ? 'v1' : '',
        fPreco: f.preco_max || null,
        fPrecoT: f.preco_max ? this.tDePreco(Number(f.preco_max)) : null,
        precoTocado: !!f.preco_max,
        saraIds: Array.isArray(data.ids) ? data.ids.map(String) : [],
        saraEmpreendimentoIds: paisSara,
        saraPrecos: data.prices || {},
        saraUnidades: unidadesSara,
        saraMsgs: msgs.concat([{ eu: false, txt: data.reply || 'Busca concluída.' }])
      };
      this.aplicarFiltros(patch, () => {
        if (window.apecertoTrack) window.apecertoTrack('sara_results', {
          result_count: Number(data.count || 0),
          bairro: f.bairro || '',
          status: f.status || '',
          has_price_filter: !!f.preco_max,
          has_bedroom_filter: f.dormitorios_min != null,
          source: data.source || 'servidor'
        });
        if (Number(data.count || 0) > 0) {
          const el = document.getElementById('apes');
          if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 72, behavior: 'smooth' });
        }
      });
    } catch (e) {
      this.setState({
        saraIds: null,
        saraEmpreendimentoIds: null,
        saraMsgs: msgs.concat([{ eu: false, txt: 'Não consegui consultar o catálogo agora. Tenta de novo em instantes ou chama a gente no WhatsApp.' }])
      });
      if (window.apecertoTrack) window.apecertoTrack('sara_error', { error_type: 'request_failed' });
    }
  }
`;

design = trocaBlocoObrigatorio(design, '  saraBuscar(txt) {', '  menuFiltra(patch) {', saraProductionMethod, 'Sara conectada ao servidor');
design = trocaObrigatoria(
  design,
  `  precoDe(r) {
    if (!r) return 0;
    const bruto = r.preco_promo != null && this.valorNumerico(r.preco_promo) > 0 ? r.preco_promo : (r.preco_min != null ? r.preco_min : r.preco);
    return this.normalizarPrecoImovel(bruto, this.finalidadeDe(r));
  }`,
  `  precoDe(r) {
    if (!r) return 0;
    const p = Array.isArray(this.state.saraIds) && this.state.saraIds.includes(String(r.id)) && this.state.saraPrecos ? this.state.saraPrecos[String(r.id)] : null;
    const bruto = this.valorNumerico(p) > 0 ? p : (r.preco_promo != null && this.valorNumerico(r.preco_promo) > 0 ? r.preco_promo : (r.preco_min != null ? r.preco_min : r.preco));
    return this.normalizarPrecoImovel(bruto, this.finalidadeDe(r));
  }`,
  'preco da unidade encontrada pela Sara',
);
design = trocaObrigatoria(
  design,
  '    const precoNum = this.precoDe(r);',
  "    const precoNum = this.precoDe(r);\n    const saraUnidade = Array.isArray(this.state.saraIds) && this.state.saraIds.includes(String(r.id)) && this.state.saraUnidades ? this.state.saraUnidades[String(r.id)] : null;\n    const areaExibida = saraUnidade && saraUnidade.area != null ? Number(saraUnidade.area) : r.area_util;\n    const dormitoriosExibidos = saraUnidade && saraUnidade.dormitorios != null ? Number(saraUnidade.dormitorios) : r.dormitorios;\n    const vagasExibidas = saraUnidade && saraUnidade.vagas != null ? Number(saraUnidade.vagas) : r.vagas;",
  'dados da unidade encontrada pela Sara',
);
design = trocaObrigatoria(
  design,
  `      specs: [
        this.numeroPositivo(r.area_util) ? Math.round(this.numeroPositivo(r.area_util)) + ' m²' : null,
        this.numeroPositivo(r.dormitorios) ? this.numeroPositivo(r.dormitorios) + (this.numeroPositivo(r.dormitorios) > 1 ? ' dorms' : ' dorm') : null,
        this.numeroPositivo(r.vagas) ? this.numeroPositivo(r.vagas) + (this.numeroPositivo(r.vagas) > 1 ? ' vagas' : ' vaga') : null,
        r.unidades_disponiveis > 0 ? r.unidades_disponiveis + (r.unidades_disponiveis > 1 ? ' unidades disponíveis' : ' unidade disponível') : null
      ].filter(Boolean).join(' · '),
      specIcons: [
        this.numeroPositivo(r.area_util) ? { ic: 'scan', v: Math.round(this.numeroPositivo(r.area_util)) + ' m²' } : null,
        this.numeroPositivo(r.dormitorios) ? { ic: 'bed-double', v: String(this.numeroPositivo(r.dormitorios)) } : null,
        this.numeroPositivo(r.banheiros) ? { ic: 'bath', v: String(this.numeroPositivo(r.banheiros)) } : null,
        this.numeroPositivo(r.vagas) ? { ic: 'car', v: String(this.numeroPositivo(r.vagas)) } : null
      ].filter(Boolean),`,
  `      specs: [
        this.numeroPositivo(areaExibida) ? this.numeroPositivo(areaExibida).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' m²' : null,
        this.numeroPositivo(dormitoriosExibidos) ? this.numeroPositivo(dormitoriosExibidos) + (this.numeroPositivo(dormitoriosExibidos) === 1 ? ' dorm' : ' dorms') : null,
        this.numeroPositivo(vagasExibidas) ? this.numeroPositivo(vagasExibidas) + (this.numeroPositivo(vagasExibidas) === 1 ? ' vaga' : ' vagas') : null,
        !saraUnidade && r.unidades_disponiveis > 0 ? r.unidades_disponiveis + (r.unidades_disponiveis > 1 ? ' unidades disponíveis' : ' unidade disponível') : null
      ].filter(Boolean).join(' · '),
      specIcons: [
        this.numeroPositivo(areaExibida) ? { ic: 'scan', v: this.numeroPositivo(areaExibida).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' m²' } : null,
        this.numeroPositivo(dormitoriosExibidos) ? { ic: 'bed-double', v: String(this.numeroPositivo(dormitoriosExibidos)) } : null,
        this.numeroPositivo(r.banheiros) ? { ic: 'bath', v: String(this.numeroPositivo(r.banheiros)) } : null,
        this.numeroPositivo(vagasExibidas) ? { ic: 'car', v: String(this.numeroPositivo(vagasExibidas)) } : null
      ].filter(Boolean),`,
  'ficha resumida da unidade encontrada pela Sara',
);
design = trocaObrigatoria(design, "      precoAntes: r.preco_promo && Number(r.preco) > Number(r.preco_promo) ? this.fmtR$(r.preco) : false,", "      precoAntes: !saraUnidade && r.preco_promo && Number(r.preco) > Number(r.preco_promo) ? this.fmtR$(r.preco) : false,", 'preco anterior somente fora da Sara');
design = trocaObrigatoria(design, "Object.assign({ menuOn: null, fBairro: '', fStatus: '', fDorms: '', fVagas: '', aba: 'comprar', fFinalidade: 'venda', fPreco: null, fPrecoT: null, fPrecoMin: null, fPrecoMax: null, fPrecoMinT: null, fPrecoMaxT: null, precoTocado: false, saraIds: null }, patch)", "Object.assign({ menuOn: null, fBairro: '', fStatus: '', fDorms: '', fVagas: '', aba: 'comprar', fFinalidade: 'venda', fPreco: null, fPrecoT: null, fPrecoMin: null, fPrecoMax: null, fPrecoMinT: null, fPrecoMaxT: null, precoTocado: false, saraIds: null, saraEmpreendimentoIds: null }, patch)", 'limpeza Sara no menu');
design = trocaObrigatoria(design, '    const { fBairro, fStatus, fPreco, fDorms, fVagas, fFinalidade } = this.state;', "    const { fBairro, fStatus, fPreco, fDorms, fVagas, fFinalidade } = this.state;\n    const saraAtiva = Array.isArray(this.state.saraIds);\n    const saraIds = saraAtiva ? this.state.saraIds.map(String) : null;", 'filtro IDs da Sara');
design = trocaObrigatoria(design, "      (!this.state.soFavs || this.state.favs[r.id]) &&", "      (!this.state.soFavs || this.state.favs[r.id]) &&\n      (!saraAtiva || saraIds.includes(String(r.id))) &&", 'aplicacao IDs da Sara');
design = trocaObrigatoria(design, "      (aba !== 'lancamentos' || r.status === 'em_obras' || r.status === 'lancamento') &&", "      (saraAtiva || aba !== 'lancamentos' || r.status === 'em_obras' || r.status === 'lancamento') &&", 'Sara ignora aba derivada');
design = trocaObrigatoria(design, "      (!fBairro || this.mesmoBairro(r.bairro, fBairro)) &&", "      (saraAtiva || !fBairro || this.mesmoBairro(r.bairro, fBairro)) &&", 'Sara usa bairro validado no servidor');
design = trocaObrigatoria(design, "      (!fStatus || r.status === fStatus) &&", "      (saraAtiva || !fStatus || r.status === fStatus) &&", 'Sara usa status validado no servidor');
design = trocaObrigatoria(design, "      dormOk(r) &&", "      (saraAtiva || dormOk(r)) &&", 'Sara usa dormitorios da unidade encontrada');
design = trocaObrigatoria(design, "      vagasOk(r) &&", "      (saraAtiva || vagasOk(r)) &&", 'Sara usa vagas da unidade encontrada');
design = trocaObrigatoria(design, "      (fPreco == null || fPreco >= teto || !this.precoDe(r) || this.precoDe(r) <= fPreco));", "      (saraAtiva || fPreco == null || fPreco >= teto || !this.precoDe(r) || this.precoDe(r) <= fPreco));", 'Sara usa preco da unidade encontrada');
design = trocaObrigatoria(design, '    let nota = null;\n    const ativos', "    if (saraAtiva) {\n      const ordemSara = new Map(saraIds.map((id, index) => [String(id), index]));\n      out.sort((a, b) => (ordemSara.get(String(a.id)) ?? Number.MAX_SAFE_INTEGER) - (ordemSara.get(String(b.id)) ?? Number.MAX_SAFE_INTEGER));\n    }\n    let nota = null;\n    const ativos", 'ordem de preco devolvida pela Sara');
design = trocaObrigatoria(design, '    } else if (!out.length && baseFinalidade.length) {', "    } else if (!out.length && baseFinalidade.length && !saraAtiva) {", 'sem fallback enganoso da Sara');
design = trocaObrigatoria(design, "    } else if (!out.length && rows.length) {", "    } else if (saraAtiva && !out.length) {\n      nota = 'Nenhum apê bate exatamente com o pedido feito à Sara.';\n    } else if (!out.length && rows.length) {", 'nota vazia da Sara');
design = trocaObrigatoria(design, "limparFiltros: () => this.aplicarFiltros({ fBairro: '', fStatus: '', fDorms: '', fVagas: '', fTipo: '', fAreaMin: '', fAreaMax: '', fBanheiros: '', fSuites: '', fPreco: null, fPrecoT: null, fPrecoMin: null, fPrecoMax: null, fPrecoMinT: null, fPrecoMaxT: null, precoTocado: false, mapaBounds: null, mapaBuscaPendente: false, saraIds: null })", "limparFiltros: () => this.aplicarFiltros({ fBairro: '', fStatus: '', fDorms: '', fVagas: '', fTipo: '', fAreaMin: '', fAreaMax: '', fBanheiros: '', fSuites: '', fPreco: null, fPrecoT: null, fPrecoMin: null, fPrecoMax: null, fPrecoMinT: null, fPrecoMaxT: null, precoTocado: false, mapaBounds: null, mapaBuscaPendente: false, saraIds: null, saraEmpreendimentoIds: null })", 'limpar filtros da Sara');
design = trocaObrigatoria(design, "setFBairro: e => this.aplicarFiltros({ fBairro: e.target.value })", "setFBairro: e => this.aplicarFiltros({ fBairro: e.target.value, saraIds: null })", 'bairro manual limpa Sara');
design = trocaObrigatoria(design, "setFStatus: e => this.aplicarFiltros({ fStatus: e.target.value })", "setFStatus: e => this.aplicarFiltros({ fStatus: e.target.value, saraIds: null })", 'status manual limpa Sara');
design = trocaObrigatoria(design, "this.aplicarFiltros({ fDorms: on ? '' : o.v })", "this.aplicarFiltros({ fDorms: on ? '' : o.v, saraIds: null })", 'dormitorios manuais limpam Sara');
design = trocaObrigatoria(design, "this.aplicarFiltros({ fVagas: on ? '' : o.v })", "this.aplicarFiltros({ fVagas: on ? '' : o.v, saraIds: null })", 'vagas manuais limpam Sara');
design = trocaObrigatoria(design, "precoTocado: true }); },", "precoTocado: true, saraIds: null }); },", 'preco manual limpa Sara');
design = trocaObrigatoria(design, "setComprar: () => this.aplicarFiltros({ aba: 'comprar', fFinalidade: 'venda', fPreco: null, fPrecoT: null, fPrecoMin: null, fPrecoMax: null, fPrecoMinT: null, fPrecoMaxT: null, precoTocado: false, saraIds: null })", "setComprar: () => this.aplicarFiltros({ aba: 'comprar', fFinalidade: 'venda', fPreco: null, fPrecoT: null, fPrecoMin: null, fPrecoMax: null, fPrecoMinT: null, fPrecoMaxT: null, precoTocado: false, saraIds: null, saraEmpreendimentoIds: null })", 'aba comprar limpa Sara');
design = trocaObrigatoria(design, "setLanc: () => this.aplicarFiltros({ aba: 'lancamentos', fFinalidade: 'venda', fPreco: null, fPrecoT: null, fPrecoMin: null, fPrecoMax: null, fPrecoMinT: null, fPrecoMaxT: null, precoTocado: false, saraIds: null })", "setLanc: () => this.aplicarFiltros({ aba: 'lancamentos', fFinalidade: 'venda', fPreco: null, fPrecoT: null, fPrecoMin: null, fPrecoMax: null, fPrecoMinT: null, fPrecoMaxT: null, precoTocado: false, saraIds: null, saraEmpreendimentoIds: null })", 'aba lancamentos limpa Sara');
design = trocaObrigatoria(design, "setAlugar: () => this.aplicarFiltros({ aba: 'alugar', fFinalidade: 'aluguel', fPreco: null, fPrecoT: null, fPrecoMin: null, fPrecoMax: null, fPrecoMinT: null, fPrecoMaxT: null, precoTocado: false, saraIds: null })", "setAlugar: () => this.aplicarFiltros({ aba: 'alugar', fFinalidade: 'aluguel', fPreco: null, fPrecoT: null, fPrecoMin: null, fPrecoMax: null, fPrecoMinT: null, fPrecoMaxT: null, precoTocado: false, saraIds: null, saraEmpreendimentoIds: null })", 'aba alugar limpa Sara');

// Clarity grava movimento/cliques, mas nunca recebe os blocos que podem conter
// conversa, documentos, dados de lead ou informacoes internas do portal.
design = trocaObrigatoria(design, '<div id="sara-painel" class="rw-sara" role="region" aria-label="Busca assistida pela Sara" style=', '<div id="sara-painel" class="rw-sara" role="region" aria-label="Busca assistida pela Sara" data-clarity-mask="true" style=', 'mascara conversa da Sara');
design = trocaObrigatoria(design, '<div sc-camel-on-click="{{ fichaFechar }}" style="position: fixed; inset: 0; z-index: 220;', '<div sc-camel-on-click="{{ fichaFechar }}" data-clarity-mask="true" style="position: fixed; inset: 0; z-index: 220;', 'mascara ficha financeira');
design = trocaObrigatoria(design, '<div data-portal-modal="" tabindex="-1" role="dialog" aria-modal="true" aria-label="Portal do proprietário" style="position: fixed; inset: 0; z-index: 100; background: var(--bg-page); overflow-y: auto">', '<div data-portal-modal="" tabindex="-1" role="dialog" aria-modal="true" aria-label="Portal do proprietário" data-clarity-mask="true" style="position: fixed; inset: 0; z-index: 100; background: var(--bg-page); overflow-y: auto">', 'mascara portal do proprietario');

// Imagens grandes inline aumentam o HTML inicial e precisam ser decodificadas
// antes da primeira pintura. No pacote publicado elas viram arquivos imutaveis
// com nome pelo conteudo; a URL muda somente quando os pixels mudam.
const MEDIA_INLINE_MAX_BYTES = 32 * 1024;
const mediaExtension = type => ({ jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp', gif: 'gif', avif: 'avif', 'svg+xml': 'svg' })[type.toLowerCase()] || null;
let heroFallback = null;
design = design.replace(/data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/g, (uri, type, encodedData) => {
  const extension = mediaExtension(type);
  if (!extension) return uri;
  const bytes = Buffer.from(encodedData, 'base64');
  if (bytes.length <= MEDIA_INLINE_MAX_BYTES) return uri;
  const fingerprint = createHash('sha256').update(bytes).digest('hex').slice(0, 20);
  const relative = 'assets/media/' + fingerprint + '.' + extension;
  embeddedAssets.set(relative, bytes);
  if (createHash('sha256').update(bytes).digest('hex') === heroVariants.sourceSha256) heroFallback = '/' + relative;
  return '/' + relative;
});

if (!heroFallback) throw new Error('imagem hero declarada no manifesto nao foi encontrada no design');
for (const [name, variant] of Object.entries(heroVariants.variants || {})) {
  if (!/^\/assets\/media\/[a-f0-9]{20}\.(?:avif|jpg|webp)$/.test(variant.path || '')) throw new Error('variante hero com caminho invalido: ' + name);
  const bytes = await readFile('static/' + variant.path.replace(/^\/+/, ''));
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== variant.sha256 || bytes.length !== variant.bytes) throw new Error('variante hero divergiu do manifesto: ' + name);
}
const heroImg = '<img src="' + heroFallback + '" alt="Sala decorada de um apê pronto pra morar em Moema" style="width: 100%; height: 100%; object-fit: cover; border-radius: 24px; display: block; box-shadow: var(--shadow-md)">';
const heroPicture = '<picture style="display:block;width:100%;height:100%">' +
  '<source media="(max-width: 768px)" type="image/avif" srcset="' + heroVariants.variants.avif_640.path + ' 640w" sizes="100vw">' +
  '<source media="(max-width: 768px)" type="image/webp" srcset="' + heroVariants.variants.webp_640.path + ' 640w" sizes="100vw">' +
  '<source type="image/avif" srcset="' + heroVariants.variants.avif_640.path + ' 640w, ' + heroVariants.variants.avif_1100.path + ' 1100w" sizes="(max-width: 768px) 100vw, 50vw">' +
  '<source type="image/webp" srcset="' + heroVariants.variants.webp_640.path + ' 640w, ' + heroVariants.variants.webp_1100.path + ' 1100w" sizes="(max-width: 768px) 100vw, 50vw">' +
  heroImg.replace('<img ', '<img width="1100" height="1100" fetchpriority="high" decoding="async" srcset="' + heroVariants.variants.jpeg_640.path + ' 640w, ' + heroFallback + ' 1100w" sizes="(max-width: 768px) 100vw, 50vw" ') +
  '</picture>';
design = trocaObrigatoria(design, heroImg, heroPicture, 'hero responsiva AVIF WebP e JPEG');

const leafletUrl = bundleManifest['4e06a80d-cb55-4dd3-8f0d-a47dbcf50aa4']?.url;
if (!leafletUrl) throw new Error('Leaflet ausente do manifesto');
design = trocaObrigatoria(
  design,
  'data-ape-leaflet-src="4e06a80d-cb55-4dd3-8f0d-a47dbcf50aa4"',
  'data-ape-leaflet-src="' + leafletUrl + '"',
  'URL adiada do Leaflet',
);

const templateBytes = Buffer.from(design);
const templateHash = createHash('sha256').update(templateBytes).digest('hex').slice(0, 20);
const templatePath = '/assets/bundle/' + templateHash + '.html';
embeddedAssets.set(templatePath.replace(/^\/+/, ''), templateBytes);

let shell = trocaObrigatoria(
  base,
  '    const manifest = JSON.parse(manifestEl.textContent);\n    let template = JSON.parse(templateEl.textContent);',
  `    const manifest = JSON.parse(manifestEl.textContent);\n    const templatePayload = JSON.parse(templateEl.textContent);\n    let template;\n    if (templatePayload && typeof templatePayload === 'object' && templatePayload.url) {\n      const templateResponse = await fetch(templatePayload.url, { cache: 'force-cache' });\n      if (!templateResponse.ok) throw new Error('template HTTP ' + templateResponse.status);\n      template = await templateResponse.text();\n    } else {\n      template = templatePayload;\n    }`,
  'carregamento do template externo',
);
shell = trocaObrigatoria(
  shell,
  `      try {
        const binaryStr = atob(entry.data);`,
  `      try {
        if (entry.url) {
          if (pageSet.has(uuid)) {
            const pageResponse = await fetch(entry.url, { cache: 'force-cache' });
            if (!pageResponse.ok) throw new Error('asset HTTP ' + pageResponse.status);
            pageTexts[uuid] = await pageResponse.text();
          } else {
            blobUrls[uuid] = entry.url;
          }
          return;
        }
        const binaryStr = atob(entry.data);`,
  'carregamento dos assets externos',
);
const replacePayload = (html, type, payload) => {
  const pattern = new RegExp('(<script type="__bundler/' + type + '">)\\s*[\\s\\S]*?\\s*(<\\/script>)');
  if (!pattern.test(html)) throw new Error('bloco __bundler/' + type + ' ausente');
  return html.replace(pattern, '$1\n' + JSON.stringify(payload).replace(/<\//g, '<\\u002F') + '\n  $2');
};
shell = replacePayload(shell, 'manifest', bundleManifest);
shell = replacePayload(shell, 'template', { url: templatePath });
let out = shell;

out = trocaObrigatoria(out, '<html>', '<html lang="pt-BR">', 'idioma do documento');
out = trocaObrigatoria(out, '<title>Bundled Page</title>', '<title>ApeCerto | Apartamentos em Moema</title><meta name="viewport" content="width=device-width, initial-scale=1">' + productionHead, 'SEO do head');
const lcpGraphic = bundleManifest['7c0ea5e0-a948-412d-9180-9335416036e9']?.url;
if (!lcpGraphic) throw new Error('grafismo LCP ausente do manifesto');
const criticalScriptUuids = [
  '2ec61b09-33b2-4604-b675-c12e32c0621c', // runtime do design
  '423dc31e-8e4e-4cd6-bed6-eee6085ba021', // React
  '99ceddc7-e4c8-4fd7-967d-62da1c6abea2', // ReactDOM
  '02598833-99f9-4b00-b460-5dc8ca1145b8', // componentes ApeCerto
];
const criticalScriptPreloads = criticalScriptUuids.map(uuid => {
  const url = bundleManifest[uuid]?.url;
  if (!url) throw new Error('script crítico ausente do manifesto: ' + uuid);
  return '  <link rel="preload" as="script" href="' + url + '">';
});
const criticalHead = [
  '  <link rel="preload" as="fetch" href="' + templatePath + '" crossorigin>',
  '  <link rel="preload" as="image" href="' + lcpGraphic + '" fetchpriority="high">',
  ...criticalScriptPreloads,
  '  <link rel="preconnect" href="https://diaegvfveqezispcthwk.supabase.co" crossorigin>',
  '  <link rel="dns-prefetch" href="//diaegvfveqezispcthwk.supabase.co">',
].join('\n');
out = trocaObrigatoria(out, '</head>', criticalHead + '\n</head>', 'descoberta dos recursos criticos');
out = trocaObrigatoria(
  out,
  '<body>',
  '<body>\n<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-524TZP8X" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>',
  'noscript do Tag Manager no shell publico',
);

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', out);
if (await existe('static')) await cp('static', 'dist', { recursive: true });
for (const [relative, bytes] of embeddedAssets) {
  await mkdir('dist/' + relative.slice(0, relative.lastIndexOf('/')), { recursive: true });
  await writeFile('dist/' + relative, bytes);
}
const directScriptUuids = [...design.matchAll(/<script\b[^>]*\bsrc="([0-9a-f-]{36})"/g)].map(match => match[1]);
const initialResourceUuids = [
  ...directScriptUuids,
  ...extResourceUuids,
  'b886aa71-fb4e-41f7-ba33-960f77a5ca3c',
  '7c0ea5e0-a948-412d-9180-9335416036e9',
  '2c349e41-a90f-484e-b399-241f91354687',
  '6ca08ada-3f93-4b37-86c8-e0f15e8940d3',
  'c228dd28-ee18-49a5-9d30-344b1a58f742',
  'ef871dae-3c1c-42cd-9f58-a1d19995bb62',
];
const initialAssets = [...new Set([
  templatePath,
  heroVariants.variants.avif_640.path,
  '/assets/analytics.js',
  ...initialResourceUuids.map(uuid => bundleManifest[uuid]?.url).filter(Boolean),
])];
await writeFile('dist/build-input.json', JSON.stringify({ initialAssets, templatePath }, null, 2) + '\n');
console.log('dist/index.html gerado:', out.length, 'bytes | assets externos:', embeddedAssets.size);

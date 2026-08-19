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

const trocaBlocoObrigatorio = (texto, inicio, fim, novo, rotulo) => {
  const a = texto.indexOf(inicio);
  const b = a < 0 ? -1 : texto.indexOf(fim, a + inicio.length);
  if (a < 0 || b < 0) throw new Error('bloco obrigatorio ausente: ' + rotulo);
  return texto.slice(0, a) + novo + texto.slice(b);
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
  <style id="apecerto-no-bundle-splash">#__bundler_loading,#__bundler_thumbnail{display:none!important}</style>
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"RealEstateAgent","name":"ApeCerto","url":"https://apecerto.com/","telephone":"+55 11 98015-4312","email":"contato@apecerto.com","address":{"@type":"PostalAddress","streetAddress":"Avenida Iraí, 79, conjunto 95A","addressLocality":"São Paulo","addressRegion":"SP","addressCountry":"BR"},"areaServed":["Moema","Campo Belo","Vila Nova Conceição","Brooklin","Planalto Paulista"]}</script>
  <script>window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){window.dataLayer.push(arguments)};window.gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});</script>
  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-524TZP8X');</script>
  <link rel="stylesheet" href="/assets/production.css">
  <script src="/assets/analytics.js" defer></script>`;

design = trocaObrigatoria(design, '<html><head>', '<html lang="pt-BR"><head>', 'idioma do design');
design = trocaObrigatoria(
  design,
  '<meta name="viewport" content="width=device-width, initial-scale=1">',
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>ApeCerto | Apartamentos em Moema</title>',
  'titulo do design sem tracking duplicado',
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
  '© 2026 apêcerto imóveis ltda · CRECI-SP 00000-J',
  '© 2026 apêcerto imóveis · Av. Iraí, 79, conjunto 95A',
  'rodape do detalhe',
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
  "      const payload = { empreendimento_id: det.id, empreendimento_nome: det.nome, nome: l.nome, telefone: l.telefone, email: l.email || null, preferencia_horario: pref };",
  "      const tracking = window.apecertoLeadTracking ? window.apecertoLeadTracking() : null;\n      const payload = Object.assign({ empreendimento_id: det.id, empreendimento_nome: det.nome, nome: l.nome, telefone: l.telefone, email: l.email || null, preferencia_horario: pref }, tracking ? { page_view_id: tracking.page_view_id, tracking: tracking } : {});",
  'atribuicao do lead comprador ao CRM',
);
design = trocaObrigatoria(
  design,
  '      this.fotosArq = []; this.fotosExist = []; this.form = {};',
  `      if (window.apecertoTrack) window.apecertoTrack('generate_lead', { lead_type: 'proprietario', finalidade: f.finalidade || '' });\n      this.fotosArq = []; this.fotosExist = []; this.form = {};`,
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
  "      abrePortal: (e) => { if (e && e.preventDefault) e.preventDefault(); const s = this.state.sess;",
  "      abrePortal: (e) => { if (e && e.preventDefault) e.preventDefault(); if (window.apecertoTrack) window.apecertoTrack('owner_portal_open', { source: 'site' }); const s = this.state.sess;",
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
      await window.apecertoSubmitSiteLead({
        lead_type: 'comprador',
        empreendimento_id: det.id,
        empreendimento_nome: det.nome,
        preferencia_horario: pref,
        nome: l.nome,
        telefone: l.telefone,
        email: l.email || null,
        context: {
          empreendimento_id: det.id,
          empreendimento_nome: det.nome,
          preferencia_horario: pref,
          source: 'property_detail'
        }
      });
      if (window.apecertoTrack) window.apecertoTrack('generate_lead', { lead_type: 'comprador', item_id: String(det.id || ''), item_name: det.nome || '' });
      this.lead = {};
      this.setState({ leadEnviando: false, leadOk: true });
    } catch (e) { this.setState({ leadEnviando: false, leadErro: 'Não deu certo agora — tenta de novo ou chama no WhatsApp.' }); }
  }
`;

design = trocaBlocoObrigatorio(design, '  async leadEnviar() {', '  async compartilhar() {', buyerLeadProductionMethod, 'lead comprador unificado no CRM');

const financeProductionForm = `          <div sc-camel-on-input="{{ fichaInput }}" style="display: flex; flex-direction: column; gap: 14px">
            <div style="background: var(--bg-sunken); border-radius: var(--radius-md); padding: 14px 16px; display: flex; flex-wrap: wrap; gap: 8px 24px; font-size: var(--text-sm)">
              <span style="color: var(--fg-3)">Imóvel: <strong style="color: var(--fg-1)">{{ fichaImovel }}</strong></span>
              <span style="color: var(--fg-3)">Entrada ({{ finEntradaPct }}): <strong style="color: var(--fg-1)">{{ finEntrada }}</strong></span>
              <span style="color: var(--fg-3)">A financiar ({{ finPctLabel }}): <strong style="color: var(--ape-orange)">{{ finFinanciar }}</strong></span>
            </div>
            <div style="background: var(--success-bg); color: var(--success); border-radius: var(--radius-md); padding: 10px 14px; font-size: var(--text-sm)">Nesta etapa pedimos apenas os dados necessários para o contato. CPF, RG e documentos serão solicitados pela equipe somente se você decidir avançar.</div>
            <div class="apecerto-finance-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px">
              <div style="display: flex; flex-direction: column; gap: 6px; grid-column: 1 / -1">
                <label style="font-size: var(--text-xs); font-weight: var(--weight-semibold); color: var(--fg-3)">Nome completo *</label>
                <input name="nome" autocomplete="name" placeholder="Seu nome" style="width: 100%; box-sizing: border-box; border: 1px solid var(--border-default); border-radius: 12px; height: 44px; padding: 0 14px; font-family: var(--font-body); font-size: var(--text-sm); color: var(--fg-1); background: var(--bg-surface); outline: none">
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px">
                <label style="font-size: var(--text-xs); font-weight: var(--weight-semibold); color: var(--fg-3)">Telefone / WhatsApp *</label>
                <input name="telefone" autocomplete="tel" placeholder="(11) 99999-9999" style="width: 100%; box-sizing: border-box; border: 1px solid var(--border-default); border-radius: 12px; height: 44px; padding: 0 14px; font-family: var(--font-body); font-size: var(--text-sm); color: var(--fg-1); background: var(--bg-surface); outline: none">
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px">
                <label style="font-size: var(--text-xs); font-weight: var(--weight-semibold); color: var(--fg-3)">E-mail *</label>
                <input name="email" type="email" autocomplete="email" placeholder="voce@email.com" style="width: 100%; box-sizing: border-box; border: 1px solid var(--border-default); border-radius: 12px; height: 44px; padding: 0 14px; font-family: var(--font-body); font-size: var(--text-sm); color: var(--fg-1); background: var(--bg-surface); outline: none">
              </div>
              <div style="display: flex; flex-direction: column; gap: 6px; grid-column: 1 / -1">
                <label style="font-size: var(--text-xs); font-weight: var(--weight-semibold); color: var(--fg-3)">Renda mensal aproximada *</label>
                <input name="renda" inputmode="numeric" placeholder="R$" style="width: 100%; box-sizing: border-box; border: 1px solid var(--border-default); border-radius: 12px; height: 44px; padding: 0 14px; font-family: var(--font-body); font-size: var(--text-sm); color: var(--fg-1); background: var(--bg-surface); outline: none">
              </div>
            </div>
`;

design = trocaBlocoObrigatorio(
  design,
  '          <div sc-camel-on-input="{{ fichaInput }}" style="display: flex; flex-direction: column; gap: 14px">',
  '            <sc-if value="{{ fichaErro }}" hint-placeholder-val="{{ false }}">',
  financeProductionForm,
  'formulario financeiro minimizado',
);

const financeLeadProductionMethod = `  async fichaEnviar() {
    if (this.state.fichaEnviando) return;
    const f = this.ficha, det = this.state.det, st = this.state;
    if (!f.nome || !f.telefone || !f.email) return this.setState({ fichaErro: 'Nome, telefone e e-mail são obrigatórios.' });
    if (!f.renda) return this.setState({ fichaErro: 'Coloca sua renda mensal — pode ser aproximada.' });
    this.setState({ fichaEnviando: true, fichaErro: null });
    const preco = det ? this.precoDe(det) : 0;
    try {
      if (!window.apecertoSubmitSiteLead) throw new Error('tracking_unavailable');
      await window.apecertoSubmitSiteLead({
        lead_type: 'financiamento',
        empreendimento_id: det ? det.id : null,
        empreendimento_nome: det ? det.nome : null,
        nome: f.nome,
        telefone: f.telefone,
        email: f.email,
        context: {
          empreendimento_id: det ? det.id : null,
          empreendimento_nome: det ? det.nome : null,
          renda_mensal: this.num(f.renda),
          valor_imovel: preco || null,
          percentual_financiado: st.finPct,
          valor_entrada: preco ? Math.round(preco * (100 - st.finPct) / 100) : null,
          valor_financiar: preco ? Math.round(preco * st.finPct / 100) : null,
          source: 'finance_simulator'
        }
      });
      if (window.apecertoTrack) window.apecertoTrack('generate_lead', { lead_type: 'financiamento', item_id: det ? String(det.id || '') : '' });
      this.ficha = {};
      this.setState({ fichaEnviando: false, fichaOk: true });
    } catch (e) { this.setState({ fichaEnviando: false, fichaErro: 'Não deu certo agora — tenta de novo ou chama a gente no WhatsApp.' }); }
  }
`;

design = trocaBlocoObrigatorio(design, '  async fichaEnviar() {', '  similares(det) {', financeLeadProductionMethod, 'financiamento unificado no CRM');
design = trocaObrigatoria(design, 'Preenche seus dados e a simulação do financiamento chega no seu e-mail.', 'Informe seus dados de contato e receba a orientação da equipe sobre financiamento.', 'texto seguro do financiamento');
design = trocaObrigatoria(design, 'Ficha enviada!', 'Pedido de simulação enviado!', 'confirmacao do financiamento');

// A busca publica usa uma Edge Function com IA e rate limit. O navegador nunca
// recebe a chave do modelo e a funcao devolve somente IDs da view site_produtos.
const saraProductionMethod = `  async saraBuscar(txt) {
    const pergunta = String(txt || '').trim().slice(0, 240);
    const msgs = (this.state.saraMsgs || []).concat([{ eu: true, txt: pergunta }]);
    this.setState({ saraMsgs: msgs.concat([{ eu: false, txt: 'Só um instante — estou cruzando seu pedido com os imóveis disponíveis…' }]), saraIds: null });
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
        body: JSON.stringify({ pergunta, client_id: clientId })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) throw new Error(data.mensagem || data.erro || ('erro ' + r.status));
      const f = data.filters || {};
      const minD = Number(f.dormitorios_min);
      const maxD = f.dormitorios_max == null ? null : Number(f.dormitorios_max);
      const patch = {
        aba: 'comprar',
        fBairro: f.bairro || '',
        fStatus: f.status || '',
        fDorms: Number.isFinite(minD) ? (minD <= 1 && maxD !== null && maxD <= 1 ? 'd1' : minD === 2 && maxD === 2 ? 'd2' : minD >= 3 ? 'd3' : '') : '',
        fVagas: Number(f.vagas_min) >= 2 ? 'v2' : Number(f.vagas_min) >= 1 ? 'v1' : '',
        fPreco: f.preco_max || null,
        fPrecoT: f.preco_max ? this.tDePreco(Number(f.preco_max)) : null,
        precoTocado: !!f.preco_max,
        saraIds: Array.isArray(data.ids) ? data.ids.map(String) : [],
        saraPrecos: data.prices || {},
        saraUnidades: data.units || {},
        saraMsgs: msgs.concat([{ eu: false, txt: data.reply || 'Busca concluída.' }])
      };
      this.setState(patch, () => {
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
    const valor = Number(r.preco_promo || r.preco_min || r.preco) || 0;
    const finalidade = String(r.finalidade || 'venda').trim().toLowerCase();
    return finalidade !== 'aluguel' && valor > 0 && valor < 100000 ? valor * 1000 : valor;
  }`,
  `  precoDe(r) {
    const p = Array.isArray(this.state.saraIds) && this.state.saraIds.includes(String(r.id)) && this.state.saraPrecos ? this.state.saraPrecos[String(r.id)] : null;
    const valor = Number(p || r.preco_promo || r.preco_min || r.preco) || 0;
    const finalidade = String(r.finalidade || 'venda').trim().toLowerCase();
    return finalidade !== 'aluguel' && valor > 0 && valor < 100000 ? valor * 1000 : valor;
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
        r.area_util ? Math.round(Number(r.area_util)) + ' m²' : null,
        r.dormitorios ? r.dormitorios + (r.dormitorios > 1 ? ' dorms' : ' dorm') : null,
        r.vagas ? r.vagas + (r.vagas > 1 ? ' vagas' : ' vaga') : null,
        r.unidades_disponiveis > 0 ? r.unidades_disponiveis + (r.unidades_disponiveis > 1 ? ' unidades disponíveis' : ' unidade disponível') : null
      ].filter(Boolean).join(' · '),
      specIcons: [
        r.area_util ? { ic: 'scan', v: Math.round(Number(r.area_util)) + ' m²' } : null,
        r.dormitorios ? { ic: 'bed-double', v: String(r.dormitorios) } : null,
        r.banheiros ? { ic: 'bath', v: String(r.banheiros) } : null,
        r.vagas ? { ic: 'car', v: String(r.vagas) } : null
      ].filter(Boolean),`,
  `      specs: [
        areaExibida ? Number(areaExibida).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' m²' : null,
        dormitoriosExibidos != null ? dormitoriosExibidos + (dormitoriosExibidos === 1 ? ' dorm' : ' dorms') : null,
        vagasExibidas != null ? vagasExibidas + (vagasExibidas === 1 ? ' vaga' : ' vagas') : null,
        !saraUnidade && r.unidades_disponiveis > 0 ? r.unidades_disponiveis + (r.unidades_disponiveis > 1 ? ' unidades disponíveis' : ' unidade disponível') : null
      ].filter(Boolean).join(' · '),
      specIcons: [
        areaExibida ? { ic: 'scan', v: Number(areaExibida).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' m²' } : null,
        dormitoriosExibidos != null ? { ic: 'bed-double', v: String(dormitoriosExibidos) } : null,
        r.banheiros ? { ic: 'bath', v: String(r.banheiros) } : null,
        vagasExibidas != null ? { ic: 'car', v: String(vagasExibidas) } : null
      ].filter(Boolean),`,
  'ficha resumida da unidade encontrada pela Sara',
);
design = trocaObrigatoria(design, "      precoAntes: r.preco_promo && Number(r.preco) > Number(r.preco_promo) ? this.fmtR$(r.preco) : false,", "      precoAntes: !saraUnidade && r.preco_promo && Number(r.preco) > Number(r.preco_promo) ? this.fmtR$(r.preco) : false,", 'preco anterior somente fora da Sara');
design = trocaObrigatoria(design, "Object.assign({ menuOn: null, fBairro: '', fStatus: '', fDorms: '', fVagas: '', aba: 'comprar' }, patch)", "Object.assign({ menuOn: null, fBairro: '', fStatus: '', fDorms: '', fVagas: '', aba: 'comprar', saraIds: null }, patch)", 'limpeza Sara no menu');
design = trocaObrigatoria(design, '    const { fBairro, fStatus, fPreco, fDorms, fVagas } = this.state;', "    const { fBairro, fStatus, fPreco, fDorms, fVagas } = this.state;\n    const saraAtiva = Array.isArray(this.state.saraIds);\n    const saraIds = saraAtiva ? this.state.saraIds.map(String) : null;", 'filtro IDs da Sara');
design = trocaObrigatoria(design, "      (!this.state.soFavs || this.state.favs[r.id]) &&", "      (!this.state.soFavs || this.state.favs[r.id]) &&\n      (!saraAtiva || saraIds.includes(String(r.id))) &&", 'aplicacao IDs da Sara');
design = trocaObrigatoria(design, "      (aba !== 'lancamentos' || r.status === 'em_obras' || r.status === 'lancamento') &&", "      (saraAtiva || aba !== 'lancamentos' || r.status === 'em_obras' || r.status === 'lancamento') &&", 'Sara ignora aba derivada');
design = trocaObrigatoria(design, "      (!fBairro || this.mesmoBairro(r.bairro, fBairro)) &&", "      (saraAtiva || !fBairro || this.mesmoBairro(r.bairro, fBairro)) &&", 'Sara usa bairro validado no servidor');
design = trocaObrigatoria(design, "      (!fStatus || r.status === fStatus) &&", "      (saraAtiva || !fStatus || r.status === fStatus) &&", 'Sara usa status validado no servidor');
design = trocaObrigatoria(design, "      dormOk(r) &&", "      (saraAtiva || dormOk(r)) &&", 'Sara usa dormitorios da unidade encontrada');
design = trocaObrigatoria(design, "      vagasOk(r) &&", "      (saraAtiva || vagasOk(r)) &&", 'Sara usa vagas da unidade encontrada');
design = trocaObrigatoria(design, "      (fPreco == null || fPreco >= teto || !this.precoDe(r) || this.precoDe(r) <= fPreco));", "      (saraAtiva || fPreco == null || fPreco >= teto || !this.precoDe(r) || this.precoDe(r) <= fPreco));", 'Sara usa preco da unidade encontrada');
design = trocaObrigatoria(design, '    if (!out.length && rows.length) {', "    if (!out.length && rows.length && !saraAtiva) {", 'sem fallback enganoso da Sara');
design = trocaObrigatoria(design, "    } else if (ativos && out.length) {", "    } else if (saraAtiva && !out.length) {\n      nota = 'Nenhum apê bate exatamente com o pedido feito à Sara.';\n    } else if (ativos && out.length) {", 'nota vazia da Sara');
design = trocaObrigatoria(design, "fPreco: 890000, fPrecoT: null, precoTocado: false })", "fPreco: 890000, fPrecoT: null, precoTocado: false, saraIds: null })", 'limpar filtros da Sara');
design = trocaObrigatoria(design, "setFBairro: e => this.setState({ fBairro: e.target.value })", "setFBairro: e => this.setState({ fBairro: e.target.value, saraIds: null })", 'bairro manual limpa Sara');
design = trocaObrigatoria(design, "setFStatus: e => this.setState({ fStatus: e.target.value })", "setFStatus: e => this.setState({ fStatus: e.target.value, saraIds: null })", 'status manual limpa Sara');
design = trocaObrigatoria(design, "this.setState({ fDorms: on ? '' : o.v })", "this.setState({ fDorms: on ? '' : o.v, saraIds: null })", 'dormitorios manuais limpam Sara');
design = trocaObrigatoria(design, "this.setState({ fVagas: on ? '' : o.v })", "this.setState({ fVagas: on ? '' : o.v, saraIds: null })", 'vagas manuais limpam Sara');
design = trocaObrigatoria(design, "precoTocado: true }); },", "precoTocado: true, saraIds: null }); },", 'preco manual limpa Sara');
design = trocaObrigatoria(design, "setComprar: () => this.setState({ aba: 'comprar' })", "setComprar: () => this.setState({ aba: 'comprar', saraIds: null })", 'aba comprar limpa Sara');
design = trocaObrigatoria(design, "setLanc: () => this.setState({ aba: 'lancamentos' })", "setLanc: () => this.setState({ aba: 'lancamentos', saraIds: null })", 'aba lancamentos limpa Sara');

// Clarity grava movimento/cliques, mas nunca recebe os blocos que podem conter
// conversa, documentos, dados de lead ou informacoes internas do portal.
design = trocaObrigatoria(design, '<div class="rw-sara" style=', '<div class="rw-sara" data-clarity-mask="true" style=', 'mascara conversa da Sara');
design = trocaObrigatoria(design, '<div sc-camel-on-click="{{ fichaFechar }}" style="position: fixed; inset: 0; z-index: 220;', '<div sc-camel-on-click="{{ fichaFechar }}" data-clarity-mask="true" style="position: fixed; inset: 0; z-index: 220;', 'mascara ficha financeira');
design = trocaObrigatoria(design, '<div style="position: fixed; inset: 0; z-index: 100; background: var(--bg-page); overflow-y: auto">', '<div data-clarity-mask="true" style="position: fixed; inset: 0; z-index: 100; background: var(--bg-page); overflow-y: auto">', 'mascara portal do proprietario');

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

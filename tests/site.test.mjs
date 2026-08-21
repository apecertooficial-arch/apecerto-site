import test from 'node:test';
import assert from 'node:assert';
import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const existe = p => access(p).then(() => true, () => false);

test('catalogo publico consulta a view site_produtos', async () => {
  const d = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.ok(d.includes('/rest/v1/site_produtos'), 'o catalogo deve ler a view site_produtos');
});

test('cards de bairro nao abrem o seletor de arquivos no site publico', async () => {
  execFileSync(process.execPath, ['scripts/build-site.mjs'], { stdio: 'inherit' });
  const out = await readFile('dist/index.html', 'utf8');
  assert.ok(
    out.includes('data-bairro-image-link=\\"true\\"'),
    'a imagem do bairro deve ser um link normal para o catalogo',
  );
  assert.ok(
    out.includes('image-slot id=\\"{{ b.slot }}\\" shape=\\"rect\\" placeholder=\\"{{ b.foto }}\\" style=\\"pointer-events: none\\"'),
    'o componente visual nao pode capturar o clique e abrir upload',
  );
});

test('Sara ignora unidades retiradas do ar mesmo usando cliente de serviço', async () => {
  const fn = await readFile('supabase/functions/sara-site/index.ts', 'utf8');
  assert.match(fn, /\.eq\("publicado", true\)/);
});

test('build injeta o design no pacote-base', async t => {
  if (!(await existe('index.html'))) return t.skip('index.html (pacote-base) ainda nao esta no repo');
  execFileSync(process.execPath, ['scripts/build-site.mjs'], { stdio: 'inherit' });
  const out = await readFile('dist/index.html', 'utf8');
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.ok(out.startsWith('<!DOCTYPE html>'), 'dist/index.html deve ser um documento HTML');
  assert.ok(out.includes('__bundler/template'), 'bloco de template deve existir no dist');
  assert.ok(out.includes('site_produtos'), 'design injetado deve consultar site_produtos');
  assert.ok(design.includes("URLSearchParams(location.search).get('imovel')"), 'o site deve abrir o imóvel específico enviado pelo ERP');
  assert.ok(design.includes("r.titulo || r.nome"), 'o título comercial do ERP deve ser priorizado na vitrine');
  assert.ok(design.includes('detTourUrl'), 'o tour virtual cadastrado no ERP deve aparecer na ficha pública');
  assert.ok(design.includes("valor < 100000 ? valor * 1000"), 'preços legados em milhares não podem aparecer como centenas de reais');
  assert.match(
    out,
    /#__bundler_loading,\s*#__bundler_thumbnail\s*\{\s*display:\s*none;/,
    'a tela temporaria com o logo gigante deve permanecer oculta',
  );
  assert.ok(
    out.includes('#__bundler_loading,#__bundler_thumbnail{display:none!important}'),
    'a camada de producao deve ocultar a tela mesmo apos atualizar o payload do design',
  );
});

test('build aplica a camada de producao e tracking', async () => {
  execFileSync(process.execPath, ['scripts/build-site.mjs'], { stdio: 'inherit' });
  const out = await readFile('dist/index.html', 'utf8');
  const design = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  const analytics = await readFile('dist/assets/analytics.js', 'utf8');
  const siteTrack = await readFile('supabase/functions/site-track/index.ts', 'utf8');
  const crmCapi = await readFile('supabase/functions/crm-capi/index.ts', 'utf8');
  assert.ok(analytics.includes('G-P63KVXKJDH'), 'o Analytics deve estar ligado ao site');
  assert.ok(analytics.includes('y3rdh7jjn5'), 'o Clarity deve estar ligado ao site');
  assert.ok(analytics.includes("window.clarity('consentv2'"), 'o Clarity deve respeitar consentimento');
  assert.ok(analytics.includes('/functions/v1/site-track'), 'a telemetria first-party sem cookie deve estar ligada');
  assert.ok(analytics.includes("firstPartyTrack('page_view'"), 'a pagina deve registrar visualizacao anonima');
  assert.ok(analytics.includes('apecertoLeadTracking'), 'a origem deve acompanhar o lead ate o CRM');
  assert.ok(analytics.includes('apecertoSubmitSiteLead'), 'todos os formularios devem usar a porta unica de leads');
  assert.ok(analytics.includes("/rest/v1/site_leads"), 'a porta unica deve gravar no contrato canonico');
  assert.ok(analytics.includes("ATTRIBUTION_KEY = 'apecerto_attribution_v3'"), 'a atribuicao deve usar o contrato v3');
  assert.ok(analytics.includes("attribution: { first: first, last: last, current: current }"), 'first, last e current touch devem acompanhar o lead');
  assert.ok(analytics.includes("window.gtag('get', MEASUREMENT_ID, 'client_id'"), 'o GA client_id consentido deve acompanhar o lead');
  assert.ok(analytics.includes("window.gtag('get', MEASUREMENT_ID, 'session_id'"), 'o GA session_id consentido deve acompanhar o lead');
  assert.ok(analytics.includes("sessionStorage.getItem(SESSION_KEY)"), 'a sessao propria deve durar somente a aba do navegador');
  assert.ok(analytics.includes("Math.floor(capturedAt / 1000)"), 'o fbc reconstruido deve manter o instante original do clique');
  assert.ok(analytics.includes("data-consent=\"analytics\""), 'Analytics deve ter consentimento separado');
  assert.ok(analytics.includes("data-consent=\"all\""), 'marketing deve exigir aceite explicito');
  assert.ok(analytics.includes('apecerto-consent-settings'), 'o visitante deve conseguir reabrir as preferencias de privacidade');
  assert.ok(!/owner_(?:portal_open|cta_click):\s*'Lead'/.test(analytics), 'abrir o portal ou clicar no CTA nao pode ser contado como Lead na Meta');
  assert.match(analytics, /generate_lead:\s*'Lead'/, 'somente o envio concluido deve alimentar a conversao Lead');
  assert.match(analytics, /ADS_CONVERSION_LABELS\s*=\s*\{[\s\S]*generate_lead:\s*'anMDCOmFieQcEI7398BE'/, 'o envio concluido deve alimentar a conversao principal do Google Ads');
  assert.ok(analytics.includes('transaction_id: clean(eventId, 120)'), 'a conversao do Google Ads deve ser deduplicada pelo event_id');
  assert.ok(analytics.includes("window.gtag('set', 'user_data'"), 'conversoes otimizadas devem receber os dados consentidos do lead');
  assert.ok(analytics.includes("['campaign_id', 'adset_id', 'ad_group_id', 'ad_id', 'creative_id', 'placement']"), 'GA e o banco devem receber os identificadores da campanha');
  assert.doesNotMatch(analytics, /owner_(?:portal_open|cta_click):\s*'anMDCOmFieQcEI7398BE'/, 'clique ou abertura nao pode virar conversao do Google Ads');
  assert.ok(out.includes('GTM-524TZP8X'), 'o Tag Manager deve estar ligado ao site');
  assert.ok(out.includes('/assets/analytics.js'), 'o runtime de tracking deve ser carregado');
  assert.ok(out.indexOf('/assets/analytics.js') > out.indexOf('__bundler/template'), 'o tracking deve existir no documento visual definitivo');
  assert.equal((out.match(/\/assets\/analytics\.js/g) || []).length, 1, 'o runtime de tracking deve carregar uma unica vez');
  assert.equal((out.match(/googletagmanager\.com\/gtm\.js\?id=/g) || []).length, 1, 'o Tag Manager deve carregar uma unica vez');
  assert.ok(out.includes('11980154312'), 'o WhatsApp oficial deve estar no bundle');
  assert.ok(out.includes("apecertoTrack('generate_lead'"), 'leads devem disparar evento');
  assert.ok(out.includes("lead_type: 'comprador'"), 'compradores devem ser tipificados');
  assert.ok(out.includes("lead_type: 'financiamento'"), 'pedidos de financiamento devem ser tipificados');
  assert.ok(!out.includes('/rest/v1/site_simulacoes'), 'o financiamento nao pode depender de tabela inexistente');
  assert.ok(!out.includes('Precisamos do seu CPF pra rodar a simulação.'), 'o primeiro contato financeiro nao pode exigir CPF');
  assert.ok(!out.includes('name="cpf"'), 'CPF nao pode ser coletado no formulario publico inicial');
  assert.ok(!out.includes('name="rg"'), 'RG nao pode ser coletado no formulario publico inicial');
  assert.ok(analytics.includes('page_view_id: tracking.page_view_id'), 'o lead deve carregar o identificador efemero da visita');
  assert.ok(analytics.includes("event: 'apecerto_event'"), 'cada evento deve entrar no dataLayer padronizado do GTM');
  assert.ok(analytics.includes("apecerto_event_id: eventId"), 'Pixel e CAPI devem compartilhar o identificador de deduplicacao');
  assert.ok(analytics.includes("window.apecertoTrack('form_submit_attempt'"), 'tentativas de envio devem ser observaveis');
  assert.ok(analytics.includes("window.apecertoTrack('form_error'"), 'erros de formulario devem ser observaveis');
  assert.ok(analytics.includes("window.apecertoTrack('engagement_time'"), 'tempo ativo deve ser medido por faixas');
  assert.ok(siteTrack.includes('"gtm_health"'), 'o GTM deve conseguir deixar prova de saude na telemetria propria');
  assert.ok(crmCapi.includes('tracking_delivery_claim'), 'a CAPI do CRM deve aceitar somente fatos do outbox canonico');
  assert.ok(crmCapi.includes('internal_delivery_required'), 'chamadas publicas nao podem fabricar visita, proposta ou venda');
  assert.ok(crmCapi.includes('meta_lead_id: attribution?.meta_lead_id'), 'o retorno comercial deve carregar o Meta Lead ID canônico');
  assert.ok(crmCapi.includes('adset_name: attribution?.adset_name'), 'o retorno comercial deve preservar o conjunto de anúncios');
  assert.ok(out.includes('data-tracking-form=\\"agendamento\\"'), 'o abandono do agendamento deve ser classificado corretamente');
  assert.ok(out.includes('data-tracking-form=\\"financiamento\\"'), 'o abandono do financiamento deve ser classificado corretamente');
  assert.ok(out.includes('data-tracking-form=\\"proprietario\\"'), 'o abandono da captacao deve ser classificado corretamente');
  assert.ok(out.includes("window.apecertoTrack('schedule_field_select'"), 'data e horario do agendamento devem gerar eventos');
  assert.ok(out.includes("window.apecertoTrack('gallery_interaction', { item_id:"), 'galeria deve carregar o imovel no evento');
  assert.ok(out.includes("window.apecertoTrack('favorite_toggle', { item_id:"), 'favorito deve carregar o imovel no evento');
  assert.ok(design.includes("u.searchParams.set('imovel', String(r.slug || r.id))"), 'cada imovel deve ter URL compartilhavel e unica');
  assert.ok(analytics.includes("/^(gallery_interaction|favorite_toggle|whatsapp_click|phone_click|schedule_start"), 'WhatsApp e demais intencoes devem herdar o imovel aberto');
  assert.ok(!analytics.includes("/favorit/i.test(label)"), 'o filtro Favoritos nao pode virar falso AddToWishlist');
  assert.ok(out.includes('/functions/v1/sara-site'), 'a Sara deve consultar a Edge Function');
  assert.ok(out.includes('saraUnidades'), 'o card deve usar os dados da unidade encontrada pela Sara');
  assert.ok(out.includes('(saraAtiva || dormOk(r))'), 'a lista deve confiar nos dormitorios por unidade validados pela Sara');
  assert.ok(out.includes('(saraAtiva || vagasOk(r))'), 'a lista nao deve eliminar o resultado por dados agregados do empreendimento');
  assert.ok(out.includes('data-clarity-mask'), 'areas sensiveis devem estar mascaradas');
  assert.ok(out.includes('<html lang="pt-BR">'), 'o idioma deve estar definido');
  assert.ok(out.includes('<link rel="canonical" href="https://apecerto.com/">'), 'a canonical deve existir');
  assert.ok(!out.includes('CRECI-SP 00000-J'), 'o placeholder de CRECI nao pode ir para producao');
  assert.ok(!out.includes('CNPJ 00.000.000/0001-00'), 'o placeholder de CNPJ nao pode ir para producao');
});

test('telemetria sem cookie minimiza dados e tem retencao', async () => {
  const fn = await readFile('supabase/functions/site-track/index.ts', 'utf8');
  const migration = await readFile('supabase/migrations/20260817210000_site_telemetry_and_crm_attribution.sql', 'utf8');
  const identityMigration = await readFile('supabase/migrations/20260819110632_tracking_identity_attribution.sql', 'utf8');
  const unifiedLeadMigration = await readFile('supabase/migrations/20260819112719_unify_site_leads_crm.sql', 'utf8');
  assert.ok(fn.includes('ALLOWED_EVENTS'), 'eventos devem usar lista permitida');
  assert.ok(fn.includes('ALLOWED_PROPERTY_KEYS'), 'propriedades devem usar lista permitida');
  assert.ok(!fn.includes('p_ip:'), 'IP nao pode ser enviado para a base analitica');
  assert.ok(migration.includes("interval '90 days'"), 'eventos devem expirar em 90 dias');
  assert.ok(migration.includes("interval '48 hours'"), 'hash de rate limit deve expirar em 48 horas');
  assert.ok(migration.includes('revoke all on table private.site_events_anon'), 'eventos nao podem ser expostos ao navegador');
  assert.ok(migration.includes('site_lead_sync_crm'), 'leads do site devem entrar no CRM');
  assert.ok(fn.includes('site_event_ingest_v2'), 'a telemetria deve usar o contrato com sessao consentida');
  assert.ok(fn.includes('consentLevel !== "essential"'), 'sessao nao pode ser aceita como telemetria essencial');
  assert.ok(identityMigration.includes('create table if not exists private.lead_attribution'), 'atribuicao normalizada deve usar leads.id como identidade canonica');
  assert.ok(identityMigration.includes('last_session_id uuid'), 'a sessao consentida deve ser vinculada ao lead');
  assert.ok(identityMigration.includes('revoke all on table private.lead_attribution from public, anon, authenticated'), 'atribuicao do lead nao pode ser publica');
  assert.ok(identityMigration.includes("coalesce(extras -> 'site_first_touch', v_first_touch)"), 'o primeiro toque nao pode ser sobrescrito em um lead existente');
  assert.ok(unifiedLeadMigration.includes("lead_type in ('comprador', 'proprietario', 'financiamento')"), 'o banco deve aceitar somente os tres tipos de lead');
  assert.ok(unifiedLeadMigration.includes('captacao_portal_sync_site_lead'), 'captacao de proprietario deve criar lead no CRM');
  assert.ok(unifiedLeadMigration.includes("context - array["), 'o contexto comercial deve usar lista fechada');
  assert.ok(!unifiedLeadMigration.includes("'cpf'"), 'o contrato de contexto nao pode aceitar CPF');
  const policies = await readFile('supabase/migrations/20260817211500_site_telemetry_private_policies.sql', 'utf8');
  assert.ok(policies.includes('to service_role'), 'tabelas privadas devem ter politica somente para o servidor');
});

test('Meta CAPI e versionada e nao transforma clique de proprietario em Lead', async () => {
  const fn = await readFile('supabase/functions/meta-capi/index.ts', 'utf8');
  assert.match(fn, /generate_lead:\s*"Lead"/, 'envio concluido deve gerar Lead na Meta');
  assert.ok(!/owner_(?:portal_open|cta_click):\s*"Lead"/.test(fn), 'clique e abertura nao podem gerar Lead');
  assert.ok(fn.includes('event_id: eventId'), 'Pixel e CAPI devem manter o identificador de deduplicacao');
  assert.ok(fn.includes('consent_marketing !== true'), 'CAPI deve exigir consentimento de marketing');
  assert.ok(fn.includes('"capi_token_missing" }, 503'), 'token ausente deve produzir erro observavel');
});

test('contrato Tracking 360 alimenta a Inteligencia sem expor PII', async () => {
  const migration = await readFile('supabase/migrations/20260820203000_tracking_360_contract.sql', 'utf8');
  assert.ok(migration.includes('tracking_360_snapshot'), 'a Inteligencia deve ter um endpoint agregado estavel');
  assert.ok(migration.includes('form_started_without_lead'), 'abandono de formulario deve ser calculado');
  assert.ok(migration.includes('schedule_started_without_completion'), 'abandono de agendamento deve ser calculado');
  assert.ok(migration.includes('meta_delivery'), 'a saude da entrega para Meta deve estar no contrato');
  assert.ok(migration.includes('crm_attribution'), 'a atribuicao do CRM deve estar no contrato');
  assert.ok(migration.includes('revoke all on function public.tracking_360_snapshot'), 'o snapshot nao pode ser publico');
});

test('Sara do site usa somente catalogo publico e protege a chave da IA', async () => {
  const fn = await readFile('supabase/functions/sara-site/index.ts', 'utf8');
  const migration = await readFile('supabase/migrations/20260817153000_sara_site_rate_limit.sql', 'utf8');
  assert.ok(fn.includes('.from("site_produtos")'), 'a Sara deve consultar a view publica aprovada');
  assert.ok(fn.includes('units: Object.fromEntries'), 'a resposta deve incluir area, dormitorios e vagas da unidade encontrada');
  assert.ok(fn.includes('Deno.env.get("OPENAI_API_KEY")'), 'a chave deve existir somente no servidor');
  assert.ok(!fn.includes('service_role='), 'a service role nao pode estar hardcoded');
  assert.ok(migration.includes('grant execute on function public.sara_site_rate_check'), 'a funcao deve ter rate limit persistente');
  assert.ok(migration.includes('to service_role'), 'somente o servidor pode executar o rate limit');
});

test('build publica landings, privacidade e arquivos de busca', async () => {
  execFileSync(process.execPath, ['scripts/build-site.mjs'], { stdio: 'inherit' });
  for (const path of [
    'dist/avaliacao-imovel-moema/index.html',
    'dist/imoveis-moema/index.html',
    'dist/privacidade/index.html',
    'dist/robots.txt',
    'dist/sitemap.xml',
  ]) assert.ok(await existe(path), path + ' deve existir');
});

test('rota de campanha abre a landing de captacao, nao a home', async () => {
  execFileSync(process.execPath, ['scripts/build-site.mjs'], { stdio: 'inherit' });
  execFileSync(process.execPath, ['scripts/rotas.mjs'], { stdio: 'inherit' });
  const out = await readFile('dist/proprietario/cadastre-seu-imovel/index.html', 'utf8');
  assert.ok(out.includes('id="owner-form"'), 'a rota de campanha deve mostrar o formulario de proprietario');
  assert.ok(out.includes("lead_type: 'proprietario'"), 'o formulario deve criar lead de proprietario');
  assert.ok(out.includes('apecertoSubmitSiteLead'), 'o formulario deve entrar pela porta canonica do CRM');
  assert.ok(out.includes('https://apecerto.com/proprietario/cadastre-seu-imovel/'), 'a canonical deve apontar para a rota anunciada');
  assert.ok(!out.includes('Apês escolhidos um por um'), 'a rota de campanha nao pode cair na home de compradores');
});

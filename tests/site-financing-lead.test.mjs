import test from 'node:test';
import assert from 'node:assert';
import { readFile } from 'node:fs/promises';

const between = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, start + ' deve existir antes de ' + end);
  return source.slice(from, to);
};

const builtTemplate = async () => {
  const version = JSON.parse(await readFile('dist/version.json', 'utf8'));
  return readFile('dist/' + version.templatePath.replace(/^\/+/, ''), 'utf8');
};

const financingSubmitFrom = (analytics, dependencies) => {
  const block = between(
    analytics,
    'window.apecertoSubmitFinancingLead = async function (input) {',
    '// Porta unica para todos os leads publicos.',
  );
  const start = block.indexOf('async function (input) {');
  const end = block.lastIndexOf('};');
  const source = block.slice(start, end + 1);
  return Function(
    'window',
    'nextFinancingRequestId',
    'uuidOrNull',
    'clean',
    'safePageUrl',
    'trackFinancingError',
    'SUPABASE_URL',
    'fetch',
    'return (' + source + ');',
  )(
    dependencies.window,
    dependencies.nextFinancingRequestId,
    dependencies.uuidOrNull,
    dependencies.clean,
    dependencies.safePageUrl,
    dependencies.trackFinancingError,
    'https://diaegvfveqezispcthwk.supabase.co',
    dependencies.fetch,
  );
};

const firstPartyTrackFrom = (analytics, dependencies) => {
  const source = between(
    analytics,
    'function firstPartyTrack(eventName, params) {',
    'window.apecertoTrack = function (eventName, params) {',
  ).trim();
  return Function(
    'window',
    'fetch',
    'readStoredAttribution',
    'currentTouch',
    'consent',
    'ensureSessionId',
    'clean',
    'pageViewId',
    'pagePath',
    'referrerHost',
    'deviceCategory',
    'consentLevel',
    'SUPABASE_URL',
    'SUPABASE_KEY',
    'return (' + source + ');',
  )(
    dependencies.window,
    dependencies.fetch,
    () => dependencies.attribution || {},
    dependencies.currentTouch || {},
    dependencies.consent || { analytics: false, marketing: false },
    () => dependencies.sessionId || '',
    (value, maximum) => String(value == null ? '' : value).trim().slice(0, maximum),
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    () => '/imovel/ap0001/',
    () => '',
    () => 'mobile',
    () => 'essential',
    'https://diaegvfveqezispcthwk.supabase.co',
    'public-anon-key',
  );
};

const controllerFor = () => ({
  fichaSubmitInFlight: false,
  ficha: {
    nome: 'Maria Silva',
    telefone: '(11) 99999-9999',
    email: 'maria@example.com',
    renda: '10000',
  },
  state: {
    fichaEnviando: false,
    fichaOk: false,
    fichaErro: null,
    det: { id: 'item-1', nome: 'Apartamento teste', codigo: 'AP0001' },
    finPct: 80,
  },
  num: value => Number(value),
  precoDe: () => 750000,
  empreendimentoId: () => '11111111-1111-4111-8111-111111111111',
  unidadeId: () => '22222222-2222-4222-8222-222222222222',
  registrarErro() {},
  setState(next) { Object.assign(this.state, next); },
});

test('financiamento usa somente a Edge pública e o contrato idempotente', async () => {
  const analytics = await readFile('static/assets/analytics.js', 'utf8');
  const submit = between(
    analytics,
    'window.apecertoSubmitFinancingLead = async function (input) {',
    '// Porta unica para todos os leads publicos.',
  );
  const headers = between(submit, 'headers: {', '},\n        body: JSON.stringify(body)');

  assert.match(submit, /\/functions\/v1\/site-financing-lead/);
  assert.doesNotMatch(submit, /\/rest\/v1\/|apecertoSubmitSiteLead/);
  assert.equal((submit.match(/\bfetch\s*\(/g) || []).length, 1, 'não deve haver retry automático');
  assert.match(headers, /'Content-Type': 'application\/json'/);
  assert.match(headers, /'X-Idempotency-Key': requestId/);
  assert.doesNotMatch(headers, /apikey|Authorization|SUPABASE_KEY/i);
  assert.match(submit, /request_id: requestId/);
  assert.match(submit, /uuidOrNull\(result\.request_id\) !== requestId/);
  assert.match(submit, /!uuidOrNull\(result\.conversion_event_id\)/);
  assert.doesNotMatch(submit, /uuidOrNull\(result\.conversion_event_id\) !== requestId/);
  assert.match(submit, /conversion_event_id: uuidOrNull\(result\.conversion_event_id\)/);
  assert.match(submit, /response\.status !== 202/);
  assert.match(submit, /result\.accepted !== true/);
  assert.match(submit, /new window\.AbortController\(\)/);
  assert.match(submit, /controller\.abort\(\);\s*\}, 15000\)/);
  assert.match(submit, /signal: controller \? controller\.signal : undefined/);
  assert.match(submit, /error_type|trackFinancingError\(transportError, source\)/);
  assert.match(submit, /transportError === 'request_timeout' \? 408 : 0/);
  assert.match(submit, /window\.clearTimeout\(timeoutId\)/);

  for (const field of [
    'event_id', 'nome', 'telefone', 'email', 'renda_mensal', 'percentual_financiado',
    'empreendimento_id', 'unidade_id', 'page_view_id', 'tracking', 'page_url',
    'item_id', 'item_codigo', 'item_name',
  ]) {
    assert.match(submit, new RegExp('\\b' + field + ':'), field + ' deve integrar o payload');
  }
  assert.match(submit, /request_id: requestId,\s*event_id: requestId/);
  assert.match(submit, /body\.nome\.length >= 2/);
  assert.match(submit, /\/\^\[1-9\]\[0-9\]\{9,10\}\$\//);
  assert.match(submit, /\/\^55\[1-9\]\[0-9\]\{9,10\}\$\//);
  assert.match(submit, /body\.renda_mensal >= 500/);
  assert.match(submit, /body\.percentual_financiado % 5 === 0/);
  assert.doesNotMatch(submit, /cpf|rg|data_nascimento|estado_civil/i);
});

test('porta REST genérica rejeita financiamento antes de qualquer POST', async () => {
  const analytics = await readFile('static/assets/analytics.js', 'utf8');
  const generic = between(
    analytics,
    'window.apecertoSubmitSiteLead = async function (input) {',
    'function addConsentBanner() {',
  );
  const rejection = generic.indexOf("source.lead_type === 'financiamento'");
  const fetchCall = generic.indexOf('var response = await fetch(');

  assert.ok(rejection >= 0 && fetchCall > rejection);
  assert.match(generic, /financing_requires_dedicated_endpoint/);
  assert.match(generic, /error_type: 'dedicated_endpoint_required'/);
  assert.match(generic, /\/\^\(comprador\|proprietario\)\$\//);
  assert.doesNotMatch(generic, /comprador\|proprietario\|financiamento/);
});

test('timeout preserva a chave e dedupe aceita conversion_event_id anterior', async () => {
  const analytics = await readFile('static/assets/analytics.js', 'utf8');
  const requestId = '44444444-4444-4444-8444-444444444444';
  const previousConversionId = '55555555-5555-4555-8555-555555555555';
  const pageViewId = '66666666-6666-4666-8666-666666666666';
  const empreendimentoId = '77777777-7777-4777-8777-777777777777';
  const calls = [];
  const errors = [];
  let abortNext = true;

  class MockAbortController {
    constructor() { this.signal = {}; }
    abort() {
      if (!this.signal.reject) return;
      const error = new Error('aborted');
      error.name = 'AbortError';
      this.signal.reject(error);
    }
  }

  const windowMock = {
    AbortController: MockAbortController,
    apecertoLeadTracking: () => ({ page_view_id: pageViewId, consent: { analytics: true, marketing: false } }),
    setTimeout(callback, milliseconds) {
      assert.equal(milliseconds, 15000);
      if (abortNext) queueMicrotask(callback);
      return 1;
    },
    clearTimeout() {},
  };
  const submit = financingSubmitFrom(analytics, {
    window: windowMock,
    nextFinancingRequestId: () => requestId,
    uuidOrNull: value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '')) ? String(value) : null,
    clean: (value, maximum) => String(value == null ? '' : value).trim().slice(0, maximum),
    safePageUrl: () => 'https://apecerto.com/imovel/ap0001/',
    trackFinancingError: errorType => { errors.push(errorType); },
    fetch: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      if (abortNext) {
        return new Promise((resolve, reject) => { options.signal.reject = reject; });
      }
      return {
        ok: true,
        status: 202,
        json: async () => ({
          ok: true,
          accepted: true,
          duplicate: true,
          request_id: requestId,
          conversion_event_id: previousConversionId,
        }),
      };
    },
  });
  const input = {
    nome: 'Maria Silva',
    telefone: '11999999999',
    email: 'maria@example.com',
    renda_mensal: 10000,
    percentual_financiado: 80,
    empreendimento_id: empreendimentoId,
    unidade_id: null,
    item_id: 'AP0001',
    item_codigo: 'AP0001',
    item_name: 'Apartamento teste',
  };

  await assert.rejects(submit(input), error => error.status === 408);
  abortNext = false;
  const result = await submit(input);

  assert.equal(result.duplicate, true);
  assert.equal(result.conversion_event_id, previousConversionId);
  assert.deepEqual(errors, ['request_timeout']);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.options.headers['X-Idempotency-Key'], requestId);
    assert.equal(call.body.request_id, requestId);
    assert.equal(call.body.event_id, requestId);
  }
});

test('event_id fornecido é honrado por todos os canais de tracking', async () => {
  const analytics = await readFile('static/assets/analytics.js', 'utf8');
  const pageView = between(analytics, 'function marketingPageView() {', 'function applyConsent(next) {');
  const firstParty = between(analytics, 'function firstPartyTrack(eventName, params) {', 'window.apecertoTrack = function (eventName, params) {');
  const track = between(
    analytics,
    'window.apecertoTrack = function (eventName, params) {',
    'window.apecertoLeadTracking = function () {',
  );

  assert.match(pageView, /var eventId = makeUuid\(\)/);
  assert.doesNotMatch(pageView, /publicParams|suppliedEventId/);
  assert.match(track, /var suppliedEventId = uuidOrNull\(publicParams\.event_id\)/);
  assert.match(track, /delete publicParams\.event_id/);
  assert.match(track, /var eventId = suppliedEventId \|\| makeUuid\(\)/);
  assert.match(track, /firstPartyTrack\(eventName, Object\.assign\(\{ event_id: eventId \}/);
  assert.match(track, /apecerto_event_id: eventId/);
  assert.match(track, /window\.gtag\('event', eventName, payload\)/);
  assert.match(track, /metaTrack\(eventName, publicParams, eventId, identity\)/);
  assert.match(track, /adsConversion\(eventName, publicParams, eventId\)/);
  assert.match(firstParty, /controller\.abort\(\);\s*\}, 2500\)/);
  assert.match(firstParty, /window\.navigator\.sendBeacon\(trackUrl, beaconBody\)/);
  assert.match(firstParty, /text\/plain;charset=UTF-8/);
  assert.match(firstParty, /return fetch\(trackUrl/);
  assert.doesNotMatch(firstParty, /keepalive:\s*true/);
  assert.match(firstParty, /catch\(function \(\) \{\s*return false;/);
  assert.match(track, /var firstPartyPromise = firstPartyTrack/);
  assert.match(track, /return Promise\.all\(\[/);
  assert.match(track, /Promise\.resolve\(firstPartyPromise\)\.catch/);
  assert.match(track, /Promise\.resolve\(adsPromise\)\.catch/);
});

test('tracking first-party usa Beacon sem preflight e preserva o payload', async () => {
  const analytics = await readFile('static/assets/analytics.js', 'utf8');
  const beaconCalls = [];
  let fetchCalls = 0;
  const windowMock = {
    Blob,
    navigator: {
      sendBeacon(url, payload) {
        beaconCalls.push({ url, payload });
        return true;
      },
    },
    setTimeout() { throw new Error('o caminho Beacon não deve criar timeout'); },
    clearTimeout() {},
  };
  const track = firstPartyTrackFrom(analytics, {
    window: windowMock,
    fetch: async () => { fetchCalls += 1; },
    currentTouch: { utm_source: 'google', campaign_id: 'campanha-1' },
  });

  assert.equal(await track('form_submit_attempt', {
    event_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    form_context: 'financiamento',
  }), true);
  assert.equal(fetchCalls, 0);
  assert.equal(beaconCalls.length, 1);
  assert.equal(beaconCalls[0].url, 'https://diaegvfveqezispcthwk.supabase.co/functions/v1/site-track');
  assert.equal(beaconCalls[0].payload.type, 'text/plain;charset=utf-8');
  const body = JSON.parse(await beaconCalls[0].payload.text());
  assert.equal(body.event_name, 'form_submit_attempt');
  assert.equal(body.page_view_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(body.utm_source, 'google');
  assert.equal(body.properties.event_id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  assert.equal(body.properties.form_context, 'financiamento');
  assert.equal(body.properties.campaign_id, 'campanha-1');
});

test('tracking first-party cai para fetch abortável quando Beacon recusa a fila', async () => {
  const analytics = await readFile('static/assets/analytics.js', 'utf8');
  const fetchCalls = [];
  const cleared = [];
  class MockAbortController {
    constructor() { this.signal = { aborted: false }; }
    abort() { this.signal.aborted = true; }
  }
  const windowMock = {
    Blob,
    AbortController: MockAbortController,
    navigator: { sendBeacon: () => false },
    setTimeout(callback, milliseconds) {
      assert.equal(milliseconds, 2500);
      return 17;
    },
    clearTimeout(id) { cleared.push(id); },
  };
  const track = firstPartyTrackFrom(analytics, {
    window: windowMock,
    fetch: async (url, options) => {
      fetchCalls.push({ url, options });
      return { ok: true };
    },
  });

  assert.equal(await track('page_view', {}), true);
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://diaegvfveqezispcthwk.supabase.co/functions/v1/site-track');
  assert.equal(fetchCalls[0].options.keepalive, undefined);
  assert.equal(fetchCalls[0].options.headers.apikey, 'public-anon-key');
  assert.equal(fetchCalls[0].options.headers.Authorization, 'Bearer public-anon-key');
  assert.equal(fetchCalls[0].options.signal instanceof Object, true);
  assert.deepEqual(cleared, [17]);
});

test('sucesso mede tentativa e conversão somente após persistir', async () => {
  const html = await builtTemplate();
  assert.match(html, /data-financing-success="" tabindex="-1" role="status"/);
  const submit = between(html, '  async fichaEnviar() {', '  similares(det) {');
  const method = Function('window', 'return ({' + submit + '}).fichaEnviar;');
  const events = [];
  const conversionId = '33333333-3333-4333-8333-333333333333';
  let releaseAttempt;
  let persistenceCalls = 0;
  const windowMock = {
    apecertoTrack: (name, params) => {
      events.push({ name, params });
      if (name === 'form_submit_attempt') {
        return new Promise(resolve => { releaseAttempt = resolve; });
      }
      return Promise.resolve(true);
    },
    apecertoSubmitFinancingLead: async () => {
      persistenceCalls += 1;
      events.push({ name: 'persist' });
      return { accepted: true, duplicate: false, conversion_event_id: conversionId };
    },
  };
  const controller = controllerFor();

  const firstSubmission = method(windowMock).call(controller);
  const concurrentSubmission = method(windowMock).call(controller);
  await Promise.resolve();

  assert.equal(events.filter(event => event.name === 'form_submit_attempt').length, 1);
  assert.equal(persistenceCalls, 0, 'o lead deve aguardar a tentativa first-party');
  releaseAttempt(true);
  await Promise.all([firstSubmission, concurrentSubmission]);

  assert.deepEqual(events.map(event => event.name), [
    'form_submit_attempt',
    'persist',
    'generate_lead',
  ]);
  assert.equal(events.some(event => event.name === 'form_error'), false);
  assert.equal(events[2].params.event_id, conversionId);
  assert.equal(persistenceCalls, 1);
  assert.equal(controller.state.fichaOk, true);
});

test('falha mede tentativa e erro sanitizado, sem gerar conversão', async () => {
  const html = await builtTemplate();
  const submit = between(html, '  async fichaEnviar() {', '  similares(det) {');
  const method = Function('window', 'return ({' + submit + '}).fichaEnviar;');
  const events = [];
  const windowMock = {
    apecertoTrack: async (name, params) => { events.push({ name, params }); },
    apecertoSubmitFinancingLead: async () => {
      events.push({ name: 'persist' });
      await windowMock.apecertoTrack('form_error', {
        form_context: 'financiamento',
        error_type: 'temporarily_unavailable',
      });
      const error = new Error('financing_temporarily_unavailable');
      error.status = 503;
      throw error;
    },
  };
  const controller = controllerFor();

  await method(windowMock).call(controller);

  assert.deepEqual(events.map(event => event.name), [
    'form_submit_attempt',
    'persist',
    'form_error',
  ]);
  assert.equal(events.some(event => event.name === 'generate_lead'), false);
  assert.equal(events[2].params.error_type, 'temporarily_unavailable');
  assert.equal(controller.state.fichaOk, false);
  assert.equal(controller.state.fichaEnviando, false);
  assert.equal(controller.fichaSubmitInFlight, false);
});

test('UI confirma antes do WhatsApp e não duplica abertura ou envio', async () => {
  const html = await builtTemplate();
  const submit = between(html, '  async fichaEnviar() {', '  similares(det) {');
  const open = between(html, '  abrirFicha() {', '  fecharFicha() {');
  const close = between(html, '  fecharFicha() {', '  PIN_LOGO');
  const success = between(
    html,
    '<sc-if value="{{ fichaOk }}" hint-placeholder-val="{{ false }}">',
    '<sc-if value="{{ fichaForm }}" hint-placeholder-val="{{ true }}">',
  );

  assert.equal((submit.match(/apecertoTrack\('form_submit_attempt'/g) || []).length, 1);
  assert.equal((submit.match(/apecertoSubmitFinancingLead\s*\(/g) || []).length, 1);
  assert.equal((submit.match(/apecertoTrack\('generate_lead'/g) || []).length, 1);
  assert.ok(
    submit.indexOf('this.fichaSubmitInFlight = true') <
      submit.indexOf("await window.apecertoTrack('form_submit_attempt'"),
    'o lock síncrono deve anteceder o primeiro await',
  );
  assert.ok(
    submit.indexOf("await window.apecertoTrack('form_submit_attempt'") <
      submit.indexOf('await window.apecertoSubmitFinancingLead'),
    'a tentativa first-party deve terminar antes da persistência',
  );
  assert.ok(
    submit.indexOf('await window.apecertoSubmitFinancingLead') <
      submit.indexOf("await window.apecertoTrack('generate_lead'"),
    'a persistência deve ocorrer antes da conversão',
  );
  assert.ok(
    submit.indexOf("await window.apecertoTrack('generate_lead'") <
      submit.indexOf('fichaOk: true'),
    'a confirmação deve aguardar o tracking',
  );
  assert.match(submit, /persisted\.accepted !== true/);
  assert.match(submit, /event_id: persisted\.conversion_event_id/);
  assert.doesNotMatch(submit, /window\.location|location\.href|wa\.me|\/rest\/v1\//);
  assert.match(submit, /this\.fichaSubmitInFlight = true/);
  assert.match(submit, /finally \{\s*this\.fichaSubmitInFlight = false/);

  assert.equal((open.match(/apecertoTrack\('financing_open'/g) || []).length, 1);
  assert.match(open, /this\.state\.fichaOn \|\| this\.fichaSubmitInFlight \|\| this\.state\.fichaEnviando/);
  assert.match(open, /const novaIntencao = this\.state\.fichaOk/);
  assert.match(open, /this\.fichaRequestItemId !== itemId/);
  assert.match(open, /novaIntencao && window\.apecertoResetFinancingLead/);
  assert.doesNotMatch(open, /this\.fichaSubmitInFlight = false/);
  assert.match(close, /if \(this\.fichaSubmitInFlight \|\| this\.state\.fichaEnviando\) return/);

  assert.match(html, /zapFlutuanteOn: !det && !st\.portalOn && !st\.galOn && !st\.fichaOn/);
  assert.match(submit, /document\.querySelector\('\[data-financing-success\]'\)/);
  assert.match(success, /data-financing-success-whatsapp=""/);
  assert.match(success, /href="\{\{ finZapUrl \}\}"/);
  assert.match(success, /Continuar no WhatsApp/);
  assert.equal((html.match(/data-financing-success-whatsapp=""/g) || []).length, 1);
  const whatsapp = between(html, 'finZapUrl: det ?', "detLinhas: det ?");
  assert.match(whatsapp, /this\.nomePublico\(det\)/);
  assert.match(whatsapp, /det\.codigo \? ' \(cód\. ' \+ det\.codigo/);

  for (const [id, name] of [
    ['financing-nome', 'nome'],
    ['financing-telefone', 'telefone'],
    ['financing-email', 'email'],
    ['financing-renda', 'renda'],
  ]) {
    assert.match(html, new RegExp('<label for="' + id + '"'));
    assert.match(html, new RegExp('<input id="' + id + '" name="' + name + '"[^>]*aria-required="true"'));
  }
  const itemLabel = between(html, 'fichaImovel: det ?', 'fichaTglConj:');
  assert.match(itemLabel, /det\.empreendimento_nome \|\| this\.nomePublico\(det\)/);
  assert.match(itemLabel, /det\.codigo/);
  assert.match(itemLabel, /det\.unidade_numero/);
  assert.doesNotMatch(itemLabel, /precoDe|fmtR\$/);
});

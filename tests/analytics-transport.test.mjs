import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const consentKey = 'apecerto_consent_v2';

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

function element() {
  const listeners = {};
  return {
    style: {},
    children: [],
    listeners,
    classList: { add() {}, remove() {} },
    parentNode: { insertBefore() {} },
    appendChild(child) { this.children.push(child); },
    addEventListener(type, listener) { listeners[type] = listener; },
    setAttribute() {},
    getAttribute() { return ''; },
    remove() {},
    closest() { return null; },
    textContent: '',
    innerText: '',
    innerHTML: '',
  };
}

async function analyticsRuntime({ marketing, analytics = marketing, page = 'https://apecerto.com/?utm_source=qa' }) {
  const source = await readFile('static/assets/analytics.js', 'utf8');
  const local = storage({
    [consentKey]: JSON.stringify({ analytics, marketing }),
  });
  const session = storage();
  const root = element();
  Object.assign(root, { clientWidth: 1280, clientHeight: 800, scrollHeight: 1200 });
  const body = element();
  Object.assign(body, { clientHeight: 800, scrollHeight: 1200, scrollTop: 0 });
  const head = element();
  const firstScript = element();
  const document = {
    body,
    head,
    documentElement: root,
    scrollingElement: root,
    readyState: 'complete',
    visibilityState: 'visible',
    referrer: '',
    cookie: '',
    addEventListener() {},
    createElement() { return element(); },
    getElementById() { return null; },
    getElementsByTagName() { return [firstScript]; },
  };
  const pageUrl = new URL(page);
  let gtmRequests = 0;
  const requests = [];
  const timers = [];
  const window = {
    document,
    location: pageUrl,
    localStorage: local,
    sessionStorage: session,
    innerWidth: 1280,
    innerHeight: 800,
    scrollY: 0,
    dataLayer: [],
    crypto: { randomUUID: () => '11111111-1111-4111-8111-111111111111' },
    history: {
      pushState(_state, _title, url) {
        if (url) pageUrl.href = new URL(url, pageUrl).href;
      },
    },
    addEventListener() {},
    setTimeout(callback, delay) { timers.push({ callback, delay }); return timers.length; },
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    apecertoLoadGtm() { gtmRequests += 1; },
  };
  window.gtag = function () {
    const args = Array.from(arguments);
    window.dataLayer.push(args);
    const payload = args[2];
    if (payload && typeof payload.event_callback === 'function') payload.event_callback();
  };
  const fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const context = vm.createContext({
    window,
    document,
    location: pageUrl,
    localStorage: local,
    sessionStorage: session,
    fetch,
    URL,
    URLSearchParams,
    Date,
    Math,
    Object,
    Array,
    Set,
    Map,
    Promise,
    JSON,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    encodeURIComponent,
    decodeURIComponent,
    setTimeout: window.setTimeout,
    clearTimeout: window.clearTimeout,
    setInterval: window.setInterval,
    clearInterval: window.clearInterval,
  });
  vm.runInContext(source, context, { filename: 'analytics.js' });
  return {
    window,
    gtmRequests: () => gtmRequests,
    requests,
    flushTimers(from = 0) {
      const pending = timers.slice(from);
      pending.forEach(({ callback }) => callback());
      return timers.length;
    },
    timerCount: () => timers.length,
  };
}

function chooseConsent(runtime, choice) {
  runtime.window.apecertoOpenConsent();
  const banner = runtime.window.document.body.children.at(-1);
  assert.ok(banner?.listeners?.click);
  banner.listeners.click({
    target: {
      closest() {
        return { getAttribute() { return choice; } };
      },
    },
  });
}

test('consentimento de marketing antecipa o GTM sem esperar window.load', async () => {
  const runtime = await analyticsRuntime({ marketing: true });
  assert.equal(runtime.gtmRequests(), 1);
});

test('conversão crítica confirma o acionamento idempotente do transporte Google', async () => {
  const runtime = await analyticsRuntime({ marketing: true });
  const requestsBeforeLead = runtime.gtmRequests();
  runtime.window.apecertoTrack('generate_lead', {
    event_id: '22222222-2222-4222-8222-222222222222',
    lead_type: 'financiamento',
  });
  assert.equal(runtime.gtmRequests(), requestsBeforeLead + 1);
});

test('evento consentido mantém paridade de event_id e isola PII em user_data', async () => {
  const eventId = '33333333-3333-4333-8333-333333333333';
  const runtime = await analyticsRuntime({
    marketing: true,
    page: 'https://apecerto.com/imovel/123?utm_source=meta&email=vazamento%40exemplo.com#lead',
  });
  runtime.window.apecertoTrack('generate_lead', {
    event_id: eventId,
    lead_type: 'comprador',
    email: 'nao-deve-ir-em-parametros@exemplo.com',
    phone_number: '11999999999',
    __identity: {
      email: ' CLIENTE@EXEMPLO.COM ',
      phone: '(11) 98015-4312',
    },
  });

  const capiRequest = runtime.requests.find((request) => {
    if (!request.url.includes('/functions/v1/meta-capi') || !request.options.body) return false;
    return JSON.parse(request.options.body).event_name === 'generate_lead';
  });
  assert.ok(capiRequest);
  const capiBody = JSON.parse(capiRequest.options.body);
  assert.equal(capiBody.event_id, eventId);
  assert.equal(capiBody.email, 'cliente@exemplo.com');
  assert.equal(capiBody.phone, '+5511980154312');
  assert.equal(capiBody.event_source_url, 'https://apecerto.com/imovel/123?utm_source=meta');
  assert.equal(capiBody.custom_data.email, undefined);
  assert.equal(capiBody.custom_data.phone_number, undefined);

  const dataLayerEvent = runtime.window.dataLayer.find((entry) => entry && entry.apecerto_event_id === eventId);
  assert.ok(dataLayerEvent);
  assert.equal(dataLayerEvent.event_id, eventId);
  assert.equal(dataLayerEvent.email, undefined);
  assert.equal(dataLayerEvent.phone_number, undefined);
  assert.equal(dataLayerEvent.page_location, 'https://apecerto.com/imovel/123?utm_source=meta');

  const pixelEvent = runtime.window.fbq.queue.find((entry) => {
    return entry[0] === 'track' && entry[1] === 'Lead' && entry[3]?.eventID === eventId;
  });
  assert.ok(pixelEvent);
  assert.equal(pixelEvent[3].eventID, capiBody.event_id);
});

test('sem consentimento não envia identidade nem evento à Meta', async () => {
  const runtime = await analyticsRuntime({ marketing: false });
  runtime.window.apecertoTrack('generate_lead', {
    __identity: { email: 'cliente@exemplo.com', phone: '11980154312' },
  });
  assert.equal(runtime.requests.some((request) => request.url.includes('/functions/v1/meta-capi')), false);
});

test('UTMs e hierarquia Meta percorrem site, dataLayer e CAPI sem perder o event_id', async () => {
  const eventId = '44444444-4444-4444-8444-444444444444';
  const runtime = await analyticsRuntime({
    marketing: true,
    page: 'https://apecerto.com/imovel/aratans?utm_source=facebook&utm_medium=paid_social&utm_campaign=aratans&campaign_id=1201&adset_id=1202&ad_id=1203&fbclid=fb-click-qa',
  });

  const leadTracking = runtime.window.apecertoLeadTracking();
  assert.equal(leadTracking.attribution.first.utm_source, 'facebook');
  assert.equal(leadTracking.attribution.first.campaign_id, '1201');
  assert.equal(leadTracking.attribution.first.adset_id, '1202');
  assert.equal(leadTracking.attribution.first.ad_id, '1203');
  assert.equal(leadTracking.attribution.first.fbclid, 'fb-click-qa');
  assert.match(leadTracking.identity.fbc, /^fb\.1\.\d+\.fb-click-qa$/);

  await runtime.window.apecertoTrack('generate_lead', {
    event_id: eventId,
    lead_type: 'comprador',
  });

  const firstPartyRequest = runtime.requests.find((request) => {
    if (!request.url.includes('/functions/v1/site-track') || !request.options.body) return false;
    return JSON.parse(request.options.body).event_name === 'generate_lead';
  });
  assert.ok(firstPartyRequest);
  const firstPartyBody = JSON.parse(firstPartyRequest.options.body);
  assert.equal(firstPartyBody.utm_source, 'facebook');
  assert.equal(firstPartyBody.utm_medium, 'paid_social');
  assert.equal(firstPartyBody.utm_campaign, 'aratans');
  assert.equal(firstPartyBody.properties.event_id, eventId);
  assert.equal(firstPartyBody.properties.campaign_id, '1201');
  assert.equal(firstPartyBody.properties.adset_id, '1202');
  assert.equal(firstPartyBody.properties.ad_id, '1203');

  const capiRequest = runtime.requests.find((request) => {
    if (!request.url.includes('/functions/v1/meta-capi') || !request.options.body) return false;
    return JSON.parse(request.options.body).event_name === 'generate_lead';
  });
  assert.ok(capiRequest);
  const capiBody = JSON.parse(capiRequest.options.body);
  assert.equal(capiBody.event_id, eventId);
  assert.equal(capiBody.custom_data.utm_campaign, 'aratans');
  assert.equal(capiBody.custom_data.campaign_id, '1201');
  assert.equal(capiBody.custom_data.adset_id, '1202');
  assert.equal(capiBody.custom_data.ad_id, '1203');
  assert.match(capiBody.fbc, /^fb\.1\.\d+\.fb-click-qa$/);

  const dataLayerEvent = runtime.window.dataLayer.find((entry) => entry && entry.apecerto_event_id === eventId);
  assert.equal(dataLayerEvent.utm_source, 'facebook');
  assert.equal(dataLayerEvent.campaign_id, '1201');
  assert.equal(dataLayerEvent.adset_id, '1202');
  assert.equal(dataLayerEvent.ad_id, '1203');
});

test('retirada total de consentimento apaga atribuição e sessão persistidas', async () => {
  const runtime = await analyticsRuntime({
    marketing: true,
    page: 'https://apecerto.com/?utm_source=facebook&fbclid=fb-click-remover',
  });
  assert.ok(runtime.window.localStorage.getItem('apecerto_attribution_v3'));
  assert.ok(runtime.window.sessionStorage.getItem('apecerto_session_v1'));

  chooseConsent(runtime, 'essential');

  assert.equal(runtime.window.localStorage.getItem('apecerto_attribution_v3'), null);
  assert.equal(runtime.window.localStorage.getItem('apecerto_attribution_v2'), null);
  assert.equal(runtime.window.sessionStorage.getItem('apecerto_session_v1'), null);
  assert.equal(runtime.window.apecertoLeadTracking().identity.fbc, null);
  assert.equal(runtime.window.apecertoLeadTracking().attribution.current.fbclid, undefined);
});

test('retirada apenas de marketing preserva UTMs e sessão, mas remove click IDs', async () => {
  const runtime = await analyticsRuntime({
    marketing: true,
    page: 'https://apecerto.com/?utm_source=facebook&utm_campaign=miruna&campaign_id=120000000000001&fbclid=fb-click-parcial',
  });

  chooseConsent(runtime, 'analytics');

  const tracking = runtime.window.apecertoLeadTracking();
  assert.equal(tracking.consent.analytics, true);
  assert.equal(tracking.consent.marketing, false);
  assert.equal(tracking.attribution.first.utm_campaign, 'miruna');
  assert.equal(tracking.attribution.last.campaign_id, '120000000000001');
  assert.equal(tracking.attribution.first.fbclid, undefined);
  assert.equal(tracking.attribution.last.fbclid, undefined);
  assert.ok(runtime.window.sessionStorage.getItem('apecerto_session_v1'));
  assert.equal(tracking.identity.fbc, null);
  const capiBefore = runtime.requests.filter((request) => request.url.includes('/functions/v1/meta-capi')).length;
  await runtime.window.apecertoTrack('generate_lead', { event_id: '66666666-6666-4666-8666-666666666666' });
  assert.equal(runtime.requests.filter((request) => request.url.includes('/functions/v1/meta-capi')).length, capiBefore);
  assert.ok(runtime.window.fbq.queue.some((entry) => entry[0] === 'consent' && entry[1] === 'revoke'));
});

test('navegação SPA preserva first touch e atualiza last touch antes da conversão', async () => {
  const runtime = await analyticsRuntime({
    marketing: true,
    page: 'https://apecerto.com/imovel/miruna?utm_source=facebook&utm_campaign=miruna&campaign_id=120000000000001&adset_id=120000000000002&ad_id=120000000000003',
  });
  const timerStart = runtime.timerCount();

  runtime.window.history.pushState({}, '', '/imovel/aratans?utm_source=facebook&utm_campaign=aratans&campaign_id=120000000000011&adset_id=120000000000012&ad_id=120000000000013');
  runtime.flushTimers(timerStart);

  const tracking = runtime.window.apecertoLeadTracking();
  assert.equal(tracking.attribution.first.utm_campaign, 'miruna');
  assert.equal(tracking.attribution.first.campaign_id, '120000000000001');
  assert.equal(tracking.attribution.last.utm_campaign, 'aratans');
  assert.equal(tracking.attribution.last.campaign_id, '120000000000011');
  assert.equal(tracking.attribution.last.adset_id, '120000000000012');
  assert.equal(tracking.attribution.last.ad_id, '120000000000013');

  const eventId = '55555555-5555-4555-8555-555555555555';
  await runtime.window.apecertoTrack('generate_lead', { event_id: eventId });
  const capiRequest = runtime.requests.find((request) => {
    if (!request.url.includes('/functions/v1/meta-capi') || !request.options.body) return false;
    const body = JSON.parse(request.options.body);
    return body.event_name === 'generate_lead' && body.event_id === eventId;
  });
  assert.equal(JSON.parse(capiRequest.options.body).custom_data.campaign_id, '120000000000011');
});

test('nova campanha na mesma rota atualiza last touch sem duplicar page_view', async () => {
  const runtime = await analyticsRuntime({
    marketing: true,
    page: 'https://apecerto.com/imoveis?utm_campaign=origem-a&campaign_id=120000000000021',
  });
  const timerStart = runtime.timerCount();
  const pageViewsBefore = runtime.window.dataLayer.filter((entry) => entry?.apecerto_event_name === 'page_view').length;

  runtime.window.history.pushState({}, '', '/imoveis?utm_campaign=origem-b&campaign_id=120000000000022');
  runtime.flushTimers(timerStart);

  const tracking = runtime.window.apecertoLeadTracking();
  assert.equal(tracking.attribution.first.utm_campaign, 'origem-a');
  assert.equal(tracking.attribution.last.utm_campaign, 'origem-b');
  assert.equal(tracking.attribution.last.campaign_id, '120000000000022');
  assert.equal(runtime.window.dataLayer.filter((entry) => entry?.apecerto_event_name === 'page_view').length, pageViewsBefore);
});

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
  return {
    style: {},
    classList: { add() {}, remove() {} },
    parentNode: { insertBefore() {} },
    appendChild() {},
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return ''; },
    remove() {},
    closest() { return null; },
    textContent: '',
    innerText: '',
    innerHTML: '',
  };
}

async function analyticsRuntime({ marketing, page = 'https://apecerto.com/?utm_source=qa' }) {
  const source = await readFile('static/assets/analytics.js', 'utf8');
  const local = storage({
    [consentKey]: JSON.stringify({ analytics: marketing, marketing }),
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
    history: { pushState() {} },
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
  };
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
});

test('sem consentimento não envia identidade nem evento à Meta', async () => {
  const runtime = await analyticsRuntime({ marketing: false });
  runtime.window.apecertoTrack('generate_lead', {
    __identity: { email: 'cliente@exemplo.com', phone: '11980154312' },
  });
  assert.equal(runtime.requests.some((request) => request.url.includes('/functions/v1/meta-capi')), false);
});

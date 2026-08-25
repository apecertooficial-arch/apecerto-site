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

async function analyticsRuntime({ marketing }) {
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
  const pageUrl = new URL('https://apecerto.com/?utm_source=qa');
  let gtmRequests = 0;
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
  const fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
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

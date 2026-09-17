import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createSiteLeadHandler,
  normalizePhone,
  normalizeEmail,
  validateLeadPayload,
  ALLOWED_ORIGINS,
} from '../supabase/functions/site-lead/index.ts';

const ORIGIN = 'https://apecerto.com';
const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
const EMP_ID = '33333333-3333-4333-8333-333333333333';
const UNI_ID = '44444444-4444-4444-8444-444444444444';
const LEAD_ID = '55555555-5555-4555-8555-555555555555';
const SERVICE_KEY = 'sb_secret_site_lead_test_only';

function payload(overrides = {}) {
  return {
    request_id: REQUEST_ID,
    nome: '  Maria   da Silva ',
    telefone: '(11) 99999-8888',
    email: ' MARIA@EXAMPLE.COM ',
    origem: 'site',
    lead_type: 'comprador',
    empreendimento_id: EMP_ID,
    unidade_id: UNI_ID,
    empreendimento_nome: 'Residencial Teste',
    preferencia_horario: 'sábado às 10h',
    page_view_id: '22222222-2222-4222-8222-222222222222',
    tracking: { page_view_id: '22222222-2222-4222-8222-222222222222' },
    context: { empreendimento_id: EMP_ID, unidade_id: UNI_ID, source: 'property_detail' },
    ...overrides,
  };
}

function env() {
  const values = new Map([
    ['SUPABASE_URL', 'https://projeto-teste.supabase.co'],
    ['SUPABASE_SERVICE_ROLE_KEY', SERVICE_KEY],
  ]);
  return { get: (name) => values.get(name) };
}

function rpcStub(result, status = 200) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return new Response(JSON.stringify(result), { status, headers: { 'Content-Type': 'application/json' } });
    },
  };
}

async function call({ body = payload(), origin = ORIGIN, method = 'POST', result = { accepted: true, duplicate: false, id: LEAD_ID }, status = 200, headers = {} } = {}) {
  const rpc = rpcStub(result, status);
  const handler = createSiteLeadHandler({ fetchImpl: rpc.fetchImpl, env: env() });
  const init = {
    method,
    headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7', ...headers },
  };
  if (method === 'POST') init.body = typeof body === 'string' ? body : JSON.stringify(body);
  const response = await handler(new Request('https://edge.local/site-lead', init));
  const json = response.status === 204 ? null : await response.json();
  return { response, json, calls: rpc.calls };
}

test('telefone BR: aceita celular/fixo com ou sem 55 e recusa o resto', () => {
  assert.equal(normalizePhone('(11) 91234-0077'), '5511912340077');
  assert.equal(normalizePhone('+55 11 91234-0077'), '5511912340077');
  assert.equal(normalizePhone('11 3456-7890'), '551134567890');
  for (const bad of ['', '1234', '(11) 81234-0077', '(01) 91234-0077', '11 1456-7890', '5511912340077123']) {
    assert.equal(normalizePhone(bad), null, bad);
  }
});

test('e-mail normalizado e validado', () => {
  assert.equal(normalizeEmail(' A@B.CO '), 'a@b.co');
  assert.equal(normalizeEmail('sem-arroba'), null);
  assert.equal(normalizeEmail('a@b'), null);
});

test('validação devolve códigos de erro específicos', () => {
  const cases = [
    [{ request_id: 'nao-uuid' }, 'invalid_request_id'],
    [{ request_id: undefined }, 'invalid_request_id'],
    [{ lead_type: 'financiamento' }, 'invalid_lead_type'],
    [{ lead_type: 'admin' }, 'invalid_lead_type'],
    [{ origem: 'site_financiamento' }, 'invalid_origin'],
    [{ nome: 'A' }, 'invalid_name'],
    [{ nome: 'x'.repeat(121) }, 'invalid_name'],
    [{ telefone: '123' }, 'invalid_phone'],
    [{ email: 'invalido' }, 'invalid_email'],
    [{ empreendimento_id: 'abc' }, 'invalid_empreendimento_id'],
    [{ unidade_id: 'abc' }, 'invalid_unidade_id'],
    [{ empreendimento_id: null }, 'invalid_unidade_id'],
    [{ context: { cpf: '123' } }, 'invalid_context'],
    [{ context: { bairro: { nested: true } } }, 'invalid_context'],
    [{ tracking: [] }, 'invalid_tracking'],
    [{ tracking: { big: 'x'.repeat(13000) } }, 'invalid_tracking'],
    [{ campo_extra: 1 }, 'unexpected_field'],
  ];
  for (const [override, code] of cases) {
    const result = validateLeadPayload(payload(override));
    assert.equal(result.ok, false, JSON.stringify(override));
    assert.equal(result.error, code, JSON.stringify(override));
  }
});

test('validação normaliza e força o contexto coerente com o topo', () => {
  const result = validateLeadPayload(payload({ context: { unidade_id: 'forjado', source: 'property_detail', bairro: '' } }));
  assert.equal(result.ok, true);
  assert.equal(result.honeypot, false);
  assert.equal(result.lead.nome, 'Maria da Silva');
  assert.equal(result.lead.telefone, '5511999998888');
  assert.equal(result.lead.email, 'maria@example.com');
  assert.deepEqual(result.lead.context, { source: 'property_detail', unidade_id: UNI_ID, empreendimento_id: EMP_ID });

  const owner = validateLeadPayload({ request_id: REQUEST_ID, nome: 'João', telefone: '11912340077', email: null, lead_type: 'proprietario', context: { bairro: 'Moema' } });
  assert.equal(owner.ok, true);
  assert.equal(owner.lead.email, null);
  assert.deepEqual(owner.lead.context, { bairro: 'Moema' });
  assert.equal(validateLeadPayload({ request_id: REQUEST_ID, nome: 'Ana', telefone: '11912340077' }).lead.lead_type, 'comprador');
});

test('CORS somente para os domínios reais do site', async () => {
  assert.deepEqual([...ALLOWED_ORIGINS].sort(), ['https://apecerto-site.onrender.com', 'https://apecerto.com', 'https://www.apecerto.com']);
  const ok = await call({ method: 'OPTIONS' });
  assert.equal(ok.response.status, 204);
  assert.equal(ok.response.headers.get('access-control-allow-origin'), ORIGIN);
  const render = await call({ method: 'OPTIONS', origin: 'https://apecerto-site.onrender.com' });
  assert.equal(render.response.status, 204);
  const evil = await call({ method: 'OPTIONS', origin: 'https://evil.example' });
  assert.equal(evil.response.status, 403);
  assert.equal(evil.response.headers.get('access-control-allow-origin'), null);
  const post = await call({ origin: 'https://apecerto.com.evil.example' });
  assert.equal(post.response.status, 403);
  assert.equal(post.calls.length, 0);
});

test('envio válido chama a RPC com service_role, hashes e sem IP/telefone brutos nos hashes', async () => {
  const { response, json, calls } = await call();
  assert.equal(response.status, 202);
  assert.deepEqual(json, { ok: true, accepted: true, duplicate: false, id: LEAD_ID, request_id: REQUEST_ID });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://projeto-teste.supabase.co/rest/v1/rpc/site_lead_ingest');
  assert.equal(calls[0].init.headers.apikey, SERVICE_KEY);
  const body = calls[0].body;
  assert.equal(body.p_request_id, REQUEST_ID);
  assert.equal(body.p_telefone, '5511999998888');
  assert.match(body.p_ip_hash, /^[0-9a-f]{64}$/);
  assert.match(body.p_phone_hash, /^[0-9a-f]{64}$/);
  assert.notEqual(body.p_ip_hash, body.p_phone_hash);
  assert.doesNotMatch(JSON.stringify(body), /203\.0\.113\.7/);
});

test('duplicata devolve 200 com o mesmo id', async () => {
  const { response, json } = await call({ result: { accepted: true, duplicate: true, id: LEAD_ID } });
  assert.equal(response.status, 200);
  assert.equal(json.duplicate, true);
  assert.equal(json.id, LEAD_ID);
});

test('limite excedido vira 429 e inválido no banco vira 400', async () => {
  const limited = await call({ result: { accepted: false, code: 'rate_limited' } });
  assert.equal(limited.response.status, 429);
  assert.equal(limited.json.error, 'rate_limited');
  assert.ok(limited.response.headers.get('retry-after'));
  const invalid = await call({ result: { accepted: false, code: 'invalid_request' } });
  assert.equal(invalid.response.status, 400);
});

test('payload inválido responde 400 com código e não chama o banco', async () => {
  const { response, json, calls } = await call({ body: payload({ telefone: '12' }) });
  assert.equal(response.status, 400);
  assert.equal(json.error, 'invalid_phone');
  assert.equal(calls.length, 0);
  const notJson = await call({ body: '{' });
  assert.equal(notJson.response.status, 400);
});

test('honeypot preenchido finge sucesso sem gravar', async () => {
  const { response, json, calls } = await call({ body: payload({ website: 'http://spam.example' }) });
  assert.equal(response.status, 202);
  assert.equal(json.ok, true);
  assert.equal(calls.length, 0);
});

test('falha do banco vira 503 sem vazar detalhes', async () => {
  const { response, json } = await call({ status: 500, result: { message: 'boom' } });
  assert.equal(response.status, 503);
  assert.deepEqual(json, { ok: false, error: 'temporarily_unavailable' });
});

test('analytics.js usa a Edge site-lead com request_id e mantém o fallback anon idempotente', async () => {
  const analytics = await readFile('static/assets/analytics.js', 'utf8');
  const start = analytics.indexOf('window.apecertoSubmitSiteLead = async function (input) {');
  const end = analytics.indexOf('function addConsentBanner()', start);
  const submit = analytics.slice(start, end);
  assert.match(submit, /\/functions\/v1\/site-lead'/);
  assert.match(submit, /body\.request_id = requestId/);
  assert.match(submit, /response\.status === 400 \|\| response\.status === 403 \|\| response\.status === 429/);
  assert.match(submit, /fallback\.status !== 409/);
  assert.match(submit, /form_submit_attempt/);
  assert.doesNotMatch(submit.slice(0, submit.indexOf("'/functions/v1/site-lead'")), /SUPABASE_KEY/);
});

async function runSubmit({ edge, rest }) {
  const analytics = await readFile('static/assets/analytics.js', 'utf8');
  const start = analytics.indexOf('window.apecertoSubmitSiteLead = async function (input) {');
  const end = analytics.indexOf('function addConsentBanner()', start);
  const block = analytics.slice(start, end);
  const source = block.slice(block.indexOf('async function (input) {'), block.lastIndexOf('};') + 1);
  const calls = [];
  const tracked = [];
  let requestIdState = '';
  const window = {
    apecertoTrack: (name, params) => tracked.push([name, params]),
    apecertoLeadTracking: () => ({ page_view_id: '22222222-2222-4222-8222-222222222222' }),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    AbortController,
  };
  let n = 0;
  const makeUuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    if (url.includes('/functions/v1/site-lead')) return edge(calls.length);
    return rest(calls.length);
  };
  const clean = (value, max) => String(value == null ? '' : value).trim().slice(0, max);
  const uuidOrNull = (value) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean(value, 36)) ? clean(value, 36) : null);
  const state = {
    get: () => requestIdState,
    set: (v) => { requestIdState = v; },
  };
  const factory = Function('window', 'fetch', 'clean', 'uuidOrNull', 'makeUuid', 'SUPABASE_URL', 'SUPABASE_KEY', 'state',
    'var siteLeadRequestId = ""; return (' + source + ');');
  const submit = factory(window, fetchImpl, clean, uuidOrNull, makeUuid, 'https://x.supabase.co', 'anon-key', state);
  return { submit, calls, tracked };
}

const jsonRes = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const lead = { lead_type: 'proprietario', nome: 'Teste', telefone: '11912340077', email: 'a@b.co', context: { bairro: 'Moema' } };

test('navegador: sucesso na Edge não usa REST', async () => {
  const { submit, calls } = await runSubmit({ edge: () => jsonRes(202, { ok: true, accepted: true, id: LEAD_ID }), rest: () => jsonRes(201, {}) });
  assert.equal(await submit(lead), true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.request_id, /^00000000-0000-4000-8000-/);
  assert.equal(calls[0].headers.apikey, undefined);
});

test('navegador: 429 e 400 lançam erro sem fallback', async () => {
  for (const status of [429, 400]) {
    const { submit, calls } = await runSubmit({ edge: () => jsonRes(status, { ok: false, error: 'x' }), rest: () => jsonRes(201, {}) });
    await assert.rejects(submit(lead), (error) => error.status === status);
    assert.equal(calls.length, 1);
  }
});

test('navegador: Edge fora do ar cai no REST anon com o mesmo request_id; 409 conta como gravado', async () => {
  const down = await runSubmit({ edge: () => { throw new TypeError('network'); }, rest: () => new Response(null, { status: 409 }) });
  assert.equal(await down.submit(lead), true);
  assert.equal(down.calls.length, 2);
  assert.match(down.calls[1].url, /\/rest\/v1\/site_leads$/);
  assert.equal(down.calls[1].body.request_id, down.calls[0].body.request_id);
  assert.equal(down.calls[1].body.website, undefined);

  const broken = await runSubmit({ edge: () => jsonRes(503, { ok: false }), rest: () => jsonRes(401, {}) });
  await assert.rejects(broken.submit(lead), (error) => error.status === 401);
});

test('landing do proprietário tem honeypot invisível', async () => {
  const owner = await readFile('static/avaliacao-imovel-moema/index.html', 'utf8');
  assert.match(owner, /name="apc_hp" tabindex="-1" autocomplete="off"/);
  assert.match(owner, /website: data\.get\('apc_hp'\)/);
});

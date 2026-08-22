import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSiteFinancingLeadHandler } from '../supabase/functions/site-financing-lead/index.ts';

const ORIGIN = 'https://apecerto.com';
const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
const PAGE_VIEW_ID = '22222222-2222-4222-8222-222222222222';
const EMPREENDIMENTO_ID = '33333333-3333-4333-8333-333333333333';
const UNIDADE_ID = '44444444-4444-4444-8444-444444444444';
const MODERN_SERVICE_KEY = 'sb_secret_backend_test_only';

function validPayload(overrides = {}) {
  return {
    request_id: REQUEST_ID,
    event_id: REQUEST_ID,
    nome: '  Maria   da Silva  ',
    telefone: '(11) 99999-9999',
    email: '  MARIA@EXAMPLE.COM ',
    renda_mensal: '12000,50',
    percentual_financiado: 80,
    empreendimento_id: EMPREENDIMENTO_ID,
    unidade_id: UNIDADE_ID,
    page_view_id: PAGE_VIEW_ID,
    page_url: 'https://www.apecerto.com/imovel/ap-teste/?utm_source=teste#ficha',
    item_id: 'forjado-pelo-cliente',
    item_codigo: 'CODIGO-FORJADO',
    item_name: 'Nome forjado pelo cliente',
    tracking: {
      page_view_id: PAGE_VIEW_ID,
      session_id: '55555555-5555-4555-8555-555555555555',
      landing_path: '/imoveis-moema/?utm_source=teste',
      current_path: '/imovel/ap-teste/?gclid=segredo',
      referrer_host: 'google.com',
      consent: { analytics: false, marketing: false },
      identity: {
        ga_client_id: 'ga-nao-consentido',
        ga_session_id: 'sessao-nao-consentida',
        fbp: 'fbp-nao-consentido',
        fbc: 'fbc-nao-consentido',
      },
      attribution: {
        first: { utm_source: 'google', gclid: 'gclid-nao-consentido' },
        last: { utm_campaign: 'moema', fbclid: 'fbclid-nao-consentido' },
        current: {},
      },
    },
    ...overrides,
  };
}

function runtimeEnv(serviceKey = MODERN_SERVICE_KEY) {
  const values = new Map([
    ['SUPABASE_URL', 'https://projeto-teste.supabase.co'],
    ['SUPABASE_SERVICE_ROLE_KEY', serviceKey],
  ]);
  return { get: (name) => values.get(name) };
}

function rpcStub(result = {
  accepted: true,
  duplicate: false,
  request_id: REQUEST_ID,
  conversion_event_id: REQUEST_ID,
}, status = 200) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(result), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { calls, fetchImpl };
}

async function requestEndpoint({
  payload = validPayload(),
  rawBody,
  method = 'POST',
  origin = ORIGIN,
  idempotencyKey = payload?.request_id,
  headers = {},
  serviceKey = MODERN_SERVICE_KEY,
  rpcResult,
  rpcStatus = 200,
} = {}) {
  const rpc = rpcStub(rpcResult, rpcStatus);
  const handler = createSiteFinancingLeadHandler({
    fetchImpl: rpc.fetchImpl,
    env: runtimeEnv(serviceKey),
  });
  const requestHeaders = {
    Origin: origin,
    'Content-Type': 'application/json',
    'X-Idempotency-Key': idempotencyKey,
    'CF-Connecting-IP': '203.0.113.10',
    'User-Agent': 'ApeCerto backend test',
    ...headers,
  };
  const options = { method, headers: requestHeaders };
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    options.body = rawBody === undefined ? JSON.stringify(payload) : rawBody;
  }
  const response = await handler(new Request('https://edge.local/site-financing-lead', options));
  const body = response.status === 204 ? null : await response.json();
  return { response, body, calls: rpc.calls, requestHeaders };
}

test('CORS aceita somente origem exata e libera o header de idempotência', async () => {
  const allowed = await requestEndpoint({ method: 'OPTIONS' });
  assert.equal(allowed.response.status, 204);
  assert.equal(allowed.response.headers.get('access-control-allow-origin'), ORIGIN);
  assert.match(allowed.response.headers.get('access-control-allow-headers'), /x-idempotency-key/i);
  assert.equal(allowed.calls.length, 0);

  const denied = await requestEndpoint({ method: 'OPTIONS', origin: 'https://evil.example' });
  assert.equal(denied.response.status, 403);
  assert.equal(denied.response.headers.get('access-control-allow-origin'), null);
  assert.deepEqual(denied.body, { ok: false, error: 'origin_not_allowed' });
});

test('pedido público normaliza os dados e não exige credencial do navegador', async () => {
  const result = await requestEndpoint();
  assert.equal(result.response.status, 202);
  assert.deepEqual(result.body, {
    ok: true,
    accepted: true,
    duplicate: false,
    request_id: REQUEST_ID,
    conversion_event_id: REQUEST_ID,
  });
  assert.equal(result.requestHeaders.apikey, undefined);
  assert.equal(result.requestHeaders.Authorization, undefined);
  assert.equal(result.calls.length, 1);

  const call = result.calls[0];
  assert.equal(call.url, 'https://projeto-teste.supabase.co/rest/v1/rpc/site_financing_lead_ingest');
  assert.equal(call.init.headers.apikey, MODERN_SERVICE_KEY);
  assert.equal(call.init.headers.Authorization, undefined, 'sb_secret_ não é JWT Bearer');
  const rpcBody = JSON.parse(call.init.body);
  assert.equal(rpcBody.p_nome, 'Maria da Silva');
  assert.equal(rpcBody.p_telefone, '5511999999999');
  assert.equal(rpcBody.p_email, 'maria@example.com');
  assert.equal(rpcBody.p_renda_mensal, 12000.5);
  assert.equal(rpcBody.p_page_url, 'https://apecerto.com/imovel/ap-teste/');
  assert.equal(rpcBody.p_tracking.session_id, null);
  assert.equal(rpcBody.p_tracking.identity.ga_client_id, undefined);
  assert.equal(rpcBody.p_tracking.identity.fbp, undefined);
  assert.equal(rpcBody.p_tracking.attribution.first.gclid, undefined);
  assert.equal(rpcBody.p_tracking.attribution.first.utm_source, 'google');
  assert.equal('p_item_name' in rpcBody, false, 'metadado comercial é derivado no banco');
});

test('nome, telefone, e-mail e renda inválidos falham antes da RPC', async (t) => {
  const cases = [
    ['nome', { nome: 'A' }],
    ['telefone', { telefone: '123' }],
    ['email', { email: 'sem-arroba.example.com' }],
    ['renda mínima', { renda_mensal: 499 }],
    ['renda máxima', { renda_mensal: 10_000_001 }],
    ['percentual', { percentual_financiado: 83 }],
  ];
  for (const [label, overrides] of cases) {
    await t.test(label, async () => {
      const result = await requestEndpoint({ payload: validPayload(overrides) });
      assert.equal(result.response.status, 400);
      assert.deepEqual(result.body, { ok: false, error: 'invalid_request' });
      assert.equal(result.calls.length, 0);
    });
  }
});

test('JSON malformado, campo fora da allowlist e IDs divergentes retornam 400', async () => {
  const malformed = await requestEndpoint({ rawBody: '{"nome":' });
  assert.equal(malformed.response.status, 400);
  assert.deepEqual(malformed.body, { ok: false, error: 'invalid_request' });

  const extra = await requestEndpoint({ payload: validPayload({ admin: true }) });
  assert.equal(extra.response.status, 400);
  assert.equal(extra.calls.length, 0);

  const mismatch = await requestEndpoint({
    idempotencyKey: '66666666-6666-4666-8666-666666666666',
  });
  assert.equal(mismatch.response.status, 400);
  assert.equal(mismatch.calls.length, 0);

  const missingEvent = await requestEndpoint({
    payload: validPayload({ event_id: undefined }),
  });
  assert.equal(missingEvent.response.status, 400);
  assert.equal(missingEvent.calls.length, 0);

  const mismatchedEvent = await requestEndpoint({
    payload: validPayload({ event_id: '77777777-7777-4777-8777-777777777777' }),
  });
  assert.equal(mismatchedEvent.response.status, 400);
  assert.equal(mismatchedEvent.calls.length, 0);
});

test('dedupe é estável para a mesma carga e muda com renda ou percentual', async () => {
  const first = await requestEndpoint();
  const same = await requestEndpoint();
  const changedIncome = await requestEndpoint({
    payload: validPayload({ renda_mensal: 18000 }),
  });
  const changedPercentage = await requestEndpoint({
    payload: validPayload({ percentual_financiado: 75 }),
  });
  const hash = (result) => JSON.parse(result.calls[0].init.body).p_dedupe_hash;
  assert.equal(hash(first), hash(same));
  assert.notEqual(hash(first), hash(changedIncome));
  assert.notEqual(hash(first), hash(changedPercentage));
});

test('SQL usa janela móvel de 30 minutos e trava transacional por dedupe', async () => {
  const sql = await readFile('supabase/migrations/20260822150000_site_financing_lead_secure.sql', 'utf8');
  assert.match(sql, /pg_advisory_xact_lock[\s\S]*site-financing:request:/);
  assert.match(sql, /pg_advisory_xact_lock[\s\S]*site-financing:dedupe:/);
  assert.match(sql, /created_at\s*>=\s*clock_timestamp\(\)\s*-\s*interval '30 minutes'/);
  assert.doesNotMatch(sql, /unique\s*\(dedupe_hash,\s*dedupe_window\)/i);
  assert.doesNotMatch(sql, /date_trunc\([^\n]*dedupe|dedupe_window\s*=/i);
  assert.match(sql, /delete from private\.site_financing_lead_receipts\s+where created_at < now\(\) - interval '30 days';/i);
  assert.doesNotMatch(sql, /created_at < now\(\) - interval '30 days'\s+and site_lead_id is null/i);
});

test('resposta duplicada preserva conversion_event_id estável', async () => {
  const result = await requestEndpoint({
    rpcResult: {
      accepted: true,
      duplicate: true,
      request_id: REQUEST_ID,
      conversion_event_id: REQUEST_ID,
    },
  });
  assert.equal(result.response.status, 202);
  assert.equal(result.body.duplicate, true);
  assert.equal(result.body.conversion_event_id, REQUEST_ID);
  assert.equal(result.calls.length, 1);
});

test('erros internos são mapeados para respostas públicas sanitizadas', async (t) => {
  const cases = [
    ['conflito', { accepted: false, code: 'idempotency_conflict' }, 200, 409, 'idempotency_conflict'],
    ['limite', { accepted: false, code: 'rate_limited' }, 200, 429, 'rate_limited'],
    ['alvo', { accepted: false, code: 'target_not_available' }, 200, 400, 'invalid_request'],
    ['RPC indisponível', { detalhe: 'não pode vazar' }, 500, 503, 'temporarily_unavailable'],
  ];
  for (const [label, rpcResult, rpcStatus, expectedStatus, expectedError] of cases) {
    await t.test(label, async () => {
      const result = await requestEndpoint({ rpcResult, rpcStatus });
      assert.equal(result.response.status, expectedStatus);
      assert.deepEqual(result.body, { ok: false, error: expectedError });
      assert.doesNotMatch(JSON.stringify(result.body), /detalhe|service|postgres|rpc/i);
    });
  }
});

test('artefatos entregues ao navegador não contêm segredo de serviço', async () => {
  const files = [
    'design/Site ApeCerto.dc.html',
    'static/assets/analytics.js',
    'dist/index.html',
  ];
  const version = JSON.parse(await readFile('dist/version.json', 'utf8'));
  files.push(join('dist', version.templatePath.replace(/^\/+/, '')));
  for (const directory of ['dist/assets', 'static/assets']) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isFile() && /[.](?:js|html|json)$/i.test(entry.name)) files.push(join(directory, entry.name));
    }
  }
  for (const file of new Set(files)) {
    const content = await readFile(file, 'utf8');
    assert.doesNotMatch(content, /SUPABASE_SERVICE_ROLE_KEY|sb_secret_/i, file);
  }
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile('supabase/functions/site-seo/index.ts', 'utf8');
const seo = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

const shell = `<!doctype html><html lang="pt-BR"><head>
  <title>Home</title>
  <meta name="description" content="Home">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="https://apecerto.com/">
  <meta property="og:type" content="website">
  <meta property="og:title" content="Home">
  <meta property="og:description" content="Home">
  <meta property="og:url" content="https://apecerto.com/">
</head><body><main id="app"></main></body></html>`;

const catalog = [{
  id: '5a9f0112-76b4-4f34-9b63-a675188daf10',
  slug: 'edificio-alpha',
  nome: 'Edifício Alpha',
  titulo: 'Loft <3 & "especial"',
  seo_titulo: 'Loft editorial em Moema',
  seo_descricao: 'Descrição editorial do empreendimento.',
  descricao: 'Apartamento ensolarado & pronto para morar.',
  bairro: 'Moema',
  endereco: 'Alameda dos Testes, 10',
  cidade: 'São Paulo',
  uf: 'SP',
  preco_min: 900000,
  preco_max: 1200000,
  capa_path: 'publicas/capa alpha.jpg',
  unidades_site: [{
    id: 'b61cb041-49c8-4670-8ebd-735c8db50d06',
    slug: 'edificio-alpha-un-12',
    numero: '12',
    codigo: 'A12',
    tipologia: '2 dormitórios',
    area_m2: 74,
    vagas: 1,
    valor: 975000,
    titulo_comercial: 'Apartamento ensolarado no Edifício Alpha <3',
    descricao_comercial: 'Descrição própria da unidade que deve prevalecer sobre o texto do condomínio.',
    seo_titulo: 'Apartamento 12 em Moema',
    seo_descricao: 'Apartamento 12 com 74 m², duas suítes e uma vaga em Moema.',
    fotos: ['unidades/12.jpg'],
  }],
}, {
  id: '8d5df891-e63e-4b9f-8b11-7965d5f39b17',
  slug: 'edificio-beta',
  nome: 'Edifício Beta',
  titulo: 'Apartamento solar',
  descricao: 'Vista aberta em Campo Belo.',
  bairro: 'Campo Belo',
  endereco: 'Rua Pública, 20',
  cidade: 'São Paulo',
  uf: 'SP',
  preco: 780000,
  capa_path: 'https://images.example.com/beta.jpg',
  unidades_site: [],
}];

function testHandler(rows = catalog) {
  const calls = [];
  const fetchImpl = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/rest/v1/site_produtos')) {
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { 'content-type': 'application/json', 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` },
      });
    }
    if (url === seo.SHELL_URL) return new Response(shell, { status: 200, headers: { 'content-type': 'text/html' } });
    throw new Error('fetch inesperado: ' + url);
  };
  const envValues = new Map([
    ['SUPABASE_URL', 'https://diaegvfveqezispcthwk.supabase.co'],
    ['SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_test_only'],
  ]);
  return { handler: seo.createSiteSeoHandler({ fetchImpl, env: { get: (name) => envValues.get(name) } }), calls };
}

test('sitemap publico inclui as seis rotas fixas, empreendimentos e unidades', async () => {
  const { handler, calls } = testHandler();
  const response = await handler(new Request('https://project.supabase.co/functions/v1/site-seo/sitemap.xml'));
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /^application\/xml; charset=utf-8$/);
  assert.match(response.headers.get('cache-control') || '', /s-maxage=300/);
  assert.match(response.headers.get('etag') || '', /^"[a-f0-9]{64}"$/);
  assert.equal([...body.matchAll(/<loc>/g)].length, 9);
  for (const route of seo.FIXED_ROUTES) assert.ok(body.includes(new URL(route.path, seo.SITE_ORIGIN).href));
  assert.ok(body.includes('https://apecerto.com/imovel/edificio-alpha/'));
  assert.ok(body.includes('https://apecerto.com/imovel/edificio-alpha-un-12/'));
  assert.equal(calls.some((url) => url === seo.SHELL_URL), false, 'sitemap nao deve baixar o shell HTML');
  assert.doesNotMatch(body, /Alameda|preco|telefone|email/i);

  const cached = await handler(new Request('https://project.supabase.co/functions/v1/site-seo/sitemap.xml', {
    headers: { 'If-None-Match': response.headers.get('etag') },
  }));
  assert.equal(cached.status, 304);
  assert.equal(await cached.text(), '');
});

test('ficha injeta canonical, OG e JSON-LD com escaping seguro', async () => {
  const { handler } = testHandler();
  const response = await handler(new Request('https://project.supabase.co/functions/v1/site-seo/imovel/edificio-alpha-un-12/'));
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /^text\/html; charset=utf-8$/);
  assert.match(body, /<link rel="canonical" href="https:\/\/apecerto\.com\/imovel\/edificio-alpha-un-12\/">/);
  assert.match(body, /<meta property="og:type" content="product">/);
  assert.match(body, /<meta property="og:image" content="https:\/\/diaegvfveqezispcthwk\.supabase\.co\/storage\/v1\/object\/public\/empreendimentos\/unidades\/12\.jpg">/);
  assert.match(body, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(body, /<meta name="twitter:title" content="Apartamento 12 em Moema \| apêcerto">/);
  assert.match(body, /<meta name="twitter:image" content="https:\/\/diaegvfveqezispcthwk\.supabase\.co\/storage\/v1\/object\/public\/empreendimentos\/unidades\/12\.jpg">/);
  assert.match(body, /id="apecerto-imovel-jsonld"/);
  assert.match(body, /<title>Apartamento 12 em Moema \| apêcerto<\/title>/);
  assert.match(body, /Apartamento 12 com 74 m², duas suítes e uma vaga em Moema\./);
  assert.match(body, /\\u003c3/);
  assert.doesNotMatch(body, /<title>[^<]*<3/);
  assert.doesNotMatch(body, /<script>alert/);
});

test('duas fichas publicas entregam metadados factuais e distintos no HTML inicial', async () => {
  const { handler } = testHandler();
  const alphaResponse = await handler(new Request('https://project.supabase.co/functions/v1/site-seo/imovel/edificio-alpha-un-12/'));
  const betaResponse = await handler(new Request('https://project.supabase.co/functions/v1/site-seo/imovel/edificio-beta/'));
  const alpha = await alphaResponse.text();
  const beta = await betaResponse.text();

  assert.equal(alphaResponse.status, 200);
  assert.equal(betaResponse.status, 200);
  assert.match(alpha, /<title>Apartamento 12 em Moema \| apêcerto<\/title>/);
  assert.match(beta, /<title>Apartamento solar \| apêcerto<\/title>/);
  assert.match(alpha, /canonical" href="https:\/\/apecerto\.com\/imovel\/edificio-alpha-un-12\//);
  assert.match(beta, /canonical" href="https:\/\/apecerto\.com\/imovel\/edificio-beta\//);
  assert.notEqual(alpha, beta);
  assert.doesNotMatch(alpha, /canonical" href="https:\/\/apecerto\.com\/"/);
  assert.doesNotMatch(beta, /canonical" href="https:\/\/apecerto\.com\/"/);
  assert.match(beta, /Vista aberta em Campo Belo\./);
  assert.doesNotMatch(beta, /Alameda dos Testes|A12|975000/);
  assert.doesNotThrow(() => JSON.parse(beta.match(/id="apecerto-imovel-jsonld"[^>]*>([^<]+)<\/script>/)[1]));
});

test('imagem ausente ou insegura não vaza OG nem Twitter inválido', async () => {
  const rows = [{
    ...catalog[1],
    slug: 'sem-foto',
    capa_path: 'javascript:alert(1)',
    fotos: ['//host-inseguro.test/foto.jpg', 'arquivo\\invalido.jpg'],
  }];
  const { handler } = testHandler(rows);
  const response = await handler(new Request('https://project.supabase.co/functions/v1/site-seo/imovel/sem-foto/'));
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(body, /<meta name="twitter:card" content="summary">/);
  assert.doesNotMatch(body, /property="og:image"/);
  assert.doesNotMatch(body, /name="twitter:image"/);
  assert.doesNotMatch(body, /javascript:|host-inseguro|arquivo\\invalido/);
});

test('slug inexistente responde 404 e noindex sem expor catalogo interno', async () => {
  const { handler } = testHandler();
  const response = await handler(new Request('https://project.supabase.co/functions/v1/site-seo/imovel/inexistente/'));
  const body = await response.text();
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.match(body, /<meta name="robots" content="noindex,nofollow">/);
  assert.doesNotMatch(body, /Alameda dos Testes/);
});

test('slug malicioso ou inválido nunca herda a home indexável', async () => {
  const { handler } = testHandler();
  for (const slug of ['%3Cscript%3Ealert(1)%3C%2Fscript%3E', 'edificio--alpha', '%00alpha']) {
    const response = await handler(new Request('https://project.supabase.co/functions/v1/site-seo/imovel/' + slug + '/'));
    const body = await response.text();
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.match(body, /<meta name="robots" content="noindex,nofollow">/);
    assert.doesNotMatch(body, /<link rel="canonical" href="https:\/\/apecerto\.com\/">/);
    assert.doesNotMatch(body, /<script>alert/);
  }
});

test('indisponibilidade da origem responde 503 sem servir cópia indexável da home', async () => {
  const handler = seo.createSiteSeoHandler({
    fetchImpl: async () => new Response('indisponível', { status: 503 }),
    env: { get: (name) => name === 'SUPABASE_URL' ? 'https://diaegvfveqezispcthwk.supabase.co' : 'sb_publishable_test_only' },
  });
  const response = await handler(new Request('https://project.supabase.co/functions/v1/site-seo/imovel/edificio-beta/'));
  const body = await response.text();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(body, /canonical" href="https:\/\/apecerto\.com\/"/);
});

test('handler aceita HEAD, rejeita escrita e nunca aceita secret key', async () => {
  const { handler } = testHandler();
  const head = await handler(new Request('https://project.supabase.co/functions/v1/site-seo/sitemap.xml', { method: 'HEAD' }));
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const post = await handler(new Request('https://project.supabase.co/functions/v1/site-seo/sitemap.xml', { method: 'POST' }));
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD, OPTIONS');

  const secretHandler = seo.createSiteSeoHandler({
    fetchImpl: async () => { throw new Error('nao deveria consultar a rede'); },
    env: { get: (name) => name === 'SUPABASE_URL' ? 'https://diaegvfveqezispcthwk.supabase.co' : 'sb_secret_proibida' },
  });
  const rejected = await secretHandler(new Request('https://project.supabase.co/functions/v1/site-seo/sitemap.xml'));
  assert.equal(rejected.status, 503);
  assert.equal(rejected.headers.get('cache-control'), 'no-store');
});

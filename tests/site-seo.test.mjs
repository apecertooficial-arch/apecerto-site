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
  assert.equal([...body.matchAll(/<loc>/g)].length, 8);
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
  assert.match(body, /id="apecerto-imovel-jsonld"/);
  assert.match(body, /<title>Apartamento 12 em Moema \| apêcerto<\/title>/);
  assert.match(body, /Apartamento 12 com 74 m², duas suítes e uma vaga em Moema\./);
  assert.match(body, /\\u003c3/);
  assert.doesNotMatch(body, /<title>[^<]*<3/);
  assert.doesNotMatch(body, /<script>alert/);
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

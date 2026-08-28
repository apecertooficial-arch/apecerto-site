// Exercita por HTTP direto o contrato que o rewrite externo do Render deve
// preservar. Usa catálogo factual de teste e o shell recém-gerado, sem rede ou
// escrita no Supabase.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const source = await readFile('supabase/functions/site-seo/index.ts', 'utf8');
const seo = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const shell = await readFile('dist/index.html', 'utf8');
const rows = [
  {
    id: '5a9f0112-76b4-4f34-9b63-a675188daf10',
    slug: 'imovel-5a9f0112-76b4-4f34-9b63-a675188daf10',
    titulo: 'NOME_INTERNO_NAO_PUBLICAR',
    descricao: 'NUMERO_PRIVADO_9999',
    bairro: 'Moema',
    cidade: 'São Paulo',
    uf: 'SP',
    capa_path: 'midia:5a9f0112-76b4-4f34-9b63-a675188daf10',
    preco: 950000,
    unidades_site: [],
  },
  {
    id: '8d5df891-e63e-4b9f-8b11-7965d5f39b17',
    slug: 'imovel-8d5df891-e63e-4b9f-8b11-7965d5f39b17',
    titulo: 'OUTRO_NOME_INTERNO_NAO_PUBLICAR',
    descricao: 'ENDERECO_EXATO_NAO_PUBLICAR',
    bairro: 'Campo Belo',
    cidade: 'São Paulo',
    uf: 'SP',
    capa_path: 'midia:8d5df891-e63e-4b9f-8b11-7965d5f39b17',
    preco: 780000,
    unidades_site: [],
  },
];

const fetchImpl = async (input) => {
  const url = String(input);
  if (url.includes('/rest/v1/site_produtos')) {
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { 'content-type': 'application/json', 'content-range': `0-${rows.length - 1}/${rows.length}` },
    });
  }
  if (url === seo.SHELL_URL) return new Response(shell, { status: 200, headers: { 'content-type': 'text/html' } });
  throw new Error('origem inesperada: ' + url);
};
const envValues = new Map([
  ['SUPABASE_URL', 'https://diaegvfveqezispcthwk.supabase.co'],
  ['SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_smoke_only'],
]);
const handler = seo.createSiteSeoHandler({ fetchImpl, env: { get: (name) => envValues.get(name) } });

const server = createServer(async (request, response) => {
  const upstream = await handler(new Request('http://127.0.0.1' + (request.url || '/'), { method: request.method }));
  const headers = Object.fromEntries(upstream.headers);
  // Espelha o header final configurado no Blueprint para a resposta reescrita.
  headers['content-type'] = 'text/html; charset=utf-8';
  response.writeHead(upstream.status, headers);
  response.end(request.method === 'HEAD' ? undefined : Buffer.from(await upstream.arrayBuffer()));
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

const base = `http://127.0.0.1:${server.address().port}`;
try {
  const [solResponse, vistaResponse, missingResponse] = await Promise.all([
    fetch(base + '/imovel/imovel-5a9f0112-76b4-4f34-9b63-a675188daf10/'),
    fetch(base + '/imovel/imovel-8d5df891-e63e-4b9f-8b11-7965d5f39b17/'),
    fetch(base + '/imovel/inexistente/'),
  ]);
  const [sol, vista, missing] = await Promise.all([solResponse.text(), vistaResponse.text(), missingResponse.text()]);
  assert.equal(solResponse.status, 200);
  assert.equal(vistaResponse.status, 200);
  assert.equal(missingResponse.status, 404);
  assert.match(solResponse.headers.get('content-type') || '', /^text\/html; charset=utf-8$/);
  assert.match(sol, /<title>Apartamento em Moema, São Paulo \| apêcerto<\/title>/);
  assert.match(vista, /<title>Apartamento em Campo Belo, São Paulo \| apêcerto<\/title>/);
  assert.match(sol, /canonical" href="https:\/\/apecerto\.com\/imovel\/imovel-5a9f0112-76b4-4f34-9b63-a675188daf10\//);
  assert.match(vista, /canonical" href="https:\/\/apecerto\.com\/imovel\/imovel-8d5df891-e63e-4b9f-8b11-7965d5f39b17\//);
  assert.doesNotMatch(sol + vista, /NOME_INTERNO_NAO_PUBLICAR|NUMERO_PRIVADO_9999|ENDERECO_EXATO_NAO_PUBLICAR/);
  assert.notEqual(sol, vista);
  assert.equal(missingResponse.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.match(missing, /<meta name="robots" content="noindex,nofollow">/);
  console.log('smoke SEO aprovado: 2 fichas específicas e 1 rota 404 noindex');
} finally {
  await new Promise(resolve => server.close(resolve));
}

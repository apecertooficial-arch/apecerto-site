import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { prerenderProperties } from '../scripts/prerender-properties.mjs';

const shell = `<!doctype html><html><head><title>Home</title><meta name="description" content="home"><meta name="robots" content="index,follow"><link rel="canonical" href="https://apecerto.com/"><meta property="og:type" content="website"><meta property="og:title" content="Home"><meta property="og:description" content="home"><meta property="og:url" content="https://apecerto.com/"></head><body><div data-site-shell></div></body></html>`;

async function fixture() {
  const root = process.cwd();
  const distDir = await mkdtemp(join(tmpdir(), 'apecerto-prerender-'));
  await mkdir(join(distDir, 'imovel'), { recursive: true });
  await writeFile(join(distDir, 'index.html'), shell);
  return { root, distDir, config: { origin: 'https://apecerto.com', designSource: 'design/Site ApeCerto.dc.html' } };
}

const responseFor = rows => async () => new Response(JSON.stringify(rows), {
  status: 200,
  headers: { 'content-type': 'application/json', 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` },
});

test('pre-render usa somente o catalogo publico e escapa metadados no shell dinamico', async () => {
  const input = await fixture();
  const rows = [{
    id: '37c605d9-8bc8-418a-9c68-a73177997fb6',
    slug: 'imovel-seguro',
    titulo: 'Loft <script>alert(1)</script>',
    descricao: 'Descrição <img src=x onerror=alert(1)> segura',
    endereco: 'Rua Domingos Lopes, 123, apto 45',
    bairro: 'Moema',
    cidade: 'São Paulo',
    uf: 'SP',
    area_util: 31,
    unidades_site: [{
      id: '45dfa57e-35da-49cb-8766-4e6a61f7ec4a',
      slug: 'unidade-segura',
      tipologia: '1 dormitório',
      area_m2: 33,
      valor: 510000,
    }],
  }];
  const catalog = await prerenderProperties({ ...input, fetchImpl: responseFor(rows) });
  assert.equal(catalog.pages, 2);
  assert.match(catalog.hash, /^[a-f0-9]{64}$/);
  const html = await readFile(join(input.distDir, 'imovel/imovel-seguro/index.html'), 'utf8');
  assert.match(html, /<link rel="canonical" href="https:\/\/apecerto\.com\/imovel\/imovel-seguro\/">/);
  assert.match(html, /name="twitter:title"/);
  assert.match(html, /id="apecerto-imovel-jsonld"/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /onerror=/);
  assert.doesNotMatch(html, /Rua Domingos Lopes|streetAddress|"geo"/, 'a ficha estática não pode publicar localização privada do imóvel');
  const unitHtml = await readFile(join(input.distDir, 'imovel/unidade-segura/index.html'), 'utf8');
  assert.match(unitHtml, /<title>Apartamento com 1 quarto em Moema, São Paulo \| apêcerto<\/title>/);
  assert.match(unitHtml, /33 m²/, 'o metadado da unidade deve usar a mesma área canônica exibida no corpo');
  assert.doesNotMatch(unitHtml, /31 m²/, 'a área genérica do empreendimento não pode substituir a área da unidade');
  assert.match(await readFile(join(input.distDir, '404.html'), 'utf8'), /noindex,nofollow/);
});

test('pre-render falha fechado quando o feed esta vazio e usa identidade neutra no fallback', async () => {
  const empty = await fixture();
  await assert.rejects(prerenderProperties({ ...empty, fetchImpl: responseFor([]) }), /catalog_public_empty/);

  const fallback = await fixture();
  const catalog = await prerenderProperties({
    ...fallback,
    fetchImpl: responseFor([{ id: '37c605d9-8bc8-418a-9c68-a73177997fb6', slug: 'sem-dados', unidades_site: [] }]),
  });
  assert.equal(catalog.pages, 1);
  const html = await readFile(join(fallback.distDir, 'imovel/sem-dados/index.html'), 'utf8');
  assert.match(html, /<title>Apartamento \| apêcerto<\/title>/);
  assert.doesNotMatch(html, /NOME_INTERNO_NAO_PUBLICAR|NUMERO_PRIVADO_9999/);
});

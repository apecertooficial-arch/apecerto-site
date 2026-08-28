import assert from 'node:assert/strict';
import { access, cp, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { verifySite } from '../scripts/verifica-design.mjs';

const root = process.cwd();

async function cloneDist() {
  const temp = await mkdtemp(join(tmpdir(), 'apecerto-build-test-'));
  const dist = join(temp, 'dist');
  await cp(join(root, 'dist'), dist, { recursive: true });
  return dist;
}

function cliVerify(dist) {
  return spawnSync(process.execPath, ['scripts/verifica-design.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, APECERTO_DIST_DIR: dist },
  });
}

test('pacote de producao tem SHA, rotas e links validos', async () => {
  const result = await verifySite({ root, distDir: 'dist' });
  assert.deepEqual(result.errors, []);
  const version = JSON.parse(await readFile(join(root, 'dist/version.json'), 'utf8'));
  assert.match(version.version, /^[a-f0-9]{16}$/);
  assert.match(version.designSha256, /^[a-f0-9]{64}$/);
  assert.match(version.sourceFingerprint, /^[a-f0-9]{64}$/);
  assert.match(version.artifactFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(version.routes, [
    '/',
    '/imoveis-moema/',
    '/avaliacao-imovel-moema/',
    '/privacidade/',
    '/proprietario/',
    '/proprietario/cadastre-seu-imovel/',
  ]);
  assert.match(version.assetMap['/assets/analytics.js'], /^\/assets\/analytics\.[a-f0-9]{12}\.js$/);
  assert.match(version.assetMap['/assets/landing.css'], /^\/assets\/landing\.[a-f0-9]{12}\.css$/);
  assert.match(version.assetMap['/assets/production.css'], /^\/assets\/production\.[a-f0-9]{12}\.css$/);
});

test('verificador encerra com codigo diferente de zero quando o SHA diverge', async () => {
  const dist = await cloneDist();
  const file = join(dist, 'version.json');
  const version = JSON.parse(await readFile(file, 'utf8'));
  version.designSha256 = '0'.repeat(64);
  await writeFile(file, JSON.stringify(version, null, 2) + '\n');
  const result = cliVerify(dist);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SHA do design divergiu/);
});

test('verificador encerra com codigo diferente de zero quando falta marcador', async () => {
  const dist = await cloneDist();
  const version = JSON.parse(await readFile(join(dist, 'version.json'), 'utf8'));
  const file = join(dist, version.templatePath.replace(/^\/+/, ''));
  const html = await readFile(file, 'utf8');
  await writeFile(file, html.replace('/functions/v1/sara-site', '/functions/v1/sara-indisponivel'));
  const result = cliVerify(dist);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /marcador obrigatorio ausente/);
});

test('verificador encerra com codigo diferente de zero em rota invalida', async () => {
  const dist = await cloneDist();
  const file = join(dist, 'privacidade/index.html');
  const html = await readFile(file, 'utf8');
  await writeFile(file, html.replace('https://apecerto.com/privacidade/', 'https://apecerto.com/rota-incorreta/'));
  const result = cliVerify(dist);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /canonical invalida/);
});

test('verificador rejeita rota desativada que reaparece no pacote', async () => {
  const dist = await cloneDist();
  await mkdir(join(dist, 'diagnostico'), { recursive: true });
  await writeFile(join(dist, 'diagnostico/index.html'), '<!doctype html><title>diagnostico interno</title>');
  const result = cliVerify(dist);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /rota desativada ainda publicada/);
});

test('verificador encerra com codigo diferente de zero para link local quebrado', async () => {
  const dist = await cloneDist();
  const file = join(dist, 'index.html');
  const html = await readFile(file, 'utf8');
  await writeFile(file, html.replace('</body>', '<a href="/rota-inexistente/">quebrado</a></body>'));
  const result = cliVerify(dist);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /link local quebrado/);
});

test('build publica sitemap index, catalogo e fichas pre-renderizadas', async () => {
  const config = JSON.parse(await readFile(join(root, 'site.deploy.json'), 'utf8'));
  const sitemapIndex = await readFile(join(root, 'dist/sitemap.xml'), 'utf8');
  assert.match(sitemapIndex, /<sitemapindex\b[^>]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  assert.doesNotMatch(sitemapIndex, /<urlset\b/);
  assert.deepEqual(
    [...sitemapIndex.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]),
    ['https://apecerto.com/sitemap-catalogo.xml'],
  );
  assert.equal(config.seo.sitemapIndexFile, 'sitemap.xml');
  assert.equal(config.seo.sitemapCatalogPath, '/sitemap-catalogo.xml');
  const catalog = await readFile(join(root, 'dist/sitemap-catalogo.xml'), 'utf8');
  assert.match(catalog, /<urlset\b/);
  assert.match(catalog, /https:\/\/apecerto\.com\/imovel\/imovel-[a-f0-9-]{36}\//);
  assert.doesNotMatch(catalog, /my-one-campo-belo|ap0152/i);
  const version = JSON.parse(await readFile(join(root, 'dist/version.json'), 'utf8'));
  assert.ok(version.catalog.pages > 2);
  assert.match(version.catalog.hash, /^[a-f0-9]{64}$/);
  assert.ok(await access(join(root, 'dist/404.html')).then(() => true, () => false));
});

test('verificador rejeita sitemap index antigo e catalogo pre-renderizado invalido', async () => {
  const antigo = await cloneDist();
  await writeFile(join(antigo, 'sitemap.xml'), '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://apecerto.com/</loc></url></urlset>');
  let result = cliVerify(antigo);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /sitemap\.xml deve ser um indice fisico/);

  const invalido = await cloneDist();
  await writeFile(join(invalido, 'sitemap-catalogo.xml'), '<?xml version="1.0"?><sitemapindex/>');
  result = cliVerify(invalido);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /sitemap-catalogo\.xml deve ser um urlset fisico/);
});

test('build de producao nao executa payload ou download mutavel', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const buildSource = await readFile(join(root, 'scripts/build-site.mjs'), 'utf8');
  assert.doesNotMatch(pkg.scripts.build, /apply-payload|patch-design/);
  assert.doesNotMatch(buildSource, /(?:await\s+)?fetch\s*\(\s*['"`]https?:/);
  assert.doesNotMatch(buildSource, /node:https|node:http|undici|child_process/);
  assert.doesNotMatch(buildSource, /design-payload\.json/);
});

test('build externaliza imagem grande e explicita orcamentos de tamanho', async () => {
  const shell = await readFile(join(root, 'dist/index.html'), 'utf8');
  const version = JSON.parse(await readFile(join(root, 'dist/version.json'), 'utf8'));
  const html = await readFile(join(root, 'dist', version.templatePath.replace(/^\/+/, '')), 'utf8');
  const config = JSON.parse(await readFile(join(root, 'site.deploy.json'), 'utf8'));
  assert.ok(Buffer.byteLength(shell) <= 150000, 'o shell HTML deve ficar abaixo de 150 KB');
  assert.match(html, /\/assets\/media\/[a-f0-9]{20}\.jpg/);
  assert.match(html, /<picture[^>]*>[\s\S]*type="image\/avif"[\s\S]*type="image\/webp"/);
  assert.match(html, /<source media="\(max-width: 768px\)" type="image\/avif" srcset="\/assets\/media\/[a-f0-9]{20}\.avif 640w" sizes="100vw">/);
  assert.match(html, /srcset="\/assets\/media\/[a-f0-9]{20}\.avif 640w, \/assets\/media\/[a-f0-9]{20}\.avif 1100w"/);
  assert.match(html, /srcset="\/assets\/media\/[a-f0-9]{20}\.webp 640w, \/assets\/media\/[a-f0-9]{20}\.webp 1100w"/);
  const inline = [...html.matchAll(/data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)/g)];
  assert.ok(inline.every(match => Buffer.from(match[1], 'base64').length <= config.budgets.maxInlineImageBytes));
  assert.ok(config.budgets.maxHtmlBytes > 0);
  assert.ok(config.budgets.maxHtmlBytes <= 150000);
  assert.ok(config.budgets.maxInitialTransferBytes <= 500000);
  assert.ok(config.budgets.maxHtmlGzipBytes > 0);
  assert.ok(config.budgets.maxTotalBytes > 0);
  assert.ok(config.budgets.maxGzipRatio > 0 && config.budgets.maxGzipRatio < 1);
  const prerender = await readFile(join(root, 'scripts/prerender-properties.mjs'), 'utf8');
  assert.match(prerender, /MOA_GIF_PATH/);
  assert.match(prerender, /fac779ec499e72abf87e\.jpg/);
});

test('shell antecipa recursos críticos e o template preserva metadados após a hidratação', async () => {
  const shell = await readFile(join(root, 'dist/index.html'), 'utf8');
  const version = JSON.parse(await readFile(join(root, 'dist/version.json'), 'utf8'));
  const html = await readFile(join(root, 'dist', version.templatePath.replace(/^\/+/, '')), 'utf8');

  assert.ok(shell.includes('<link rel="preload" as="fetch" href="' + version.templatePath + '" crossorigin>'), 'o template externo deve ser descoberto no head com modo compatível com fetch');
  assert.match(shell, /<link rel="preconnect" href="https:\/\/diaegvfveqezispcthwk\.supabase\.co" crossorigin>/);
  assert.match(shell, /<link rel="preload" as="image" href="\/assets\/bundle-optimized\/[a-f0-9]{20}\.webp" fetchpriority="high">/);
  assert.equal((shell.match(/<link rel="preload" as="script" href="\/assets\/bundle\/[a-f0-9]{20}\.js">/g) || []).length, 4, 'runtime, React, ReactDOM e design system devem começar junto do template');
  assert.equal(version.initialAssets.filter(path => path.endsWith('.woff2')).length, 4, 'os quatro pesos usados na abertura devem usar WOFF2');
  assert.equal(version.initialAssets.filter(path => path.endsWith('.ttf')).length, 0, 'TTF não deve permanecer no carregamento inicial');
  assert.match(html, /format\('woff2'\)/, 'o CSS publicado deve declarar o formato comprimido correto');
  assert.doesNotMatch(html, /format\('truetype'\)/, 'o CSS publicado não deve anunciar TTF para arquivos WOFF2');
  for (const document of [shell, html]) {
    assert.match(document, /<meta name="description" content="Apartamentos para comprar em Moema/);
    assert.match(document, /<link rel="canonical" href="https:\/\/apecerto\.com\/">/);
    assert.match(document, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg">/);
    assert.match(document, /<link rel="shortcut icon" type="image\/svg\+xml" href="\/favicon\.svg">/);
    assert.match(document, /<meta property="og:image" content="https:\/\/apecerto\.com\/assets\/media\/ba920d6e62cf7c3ca6f8\.jpg">/);
    assert.match(document, /<meta name="twitter:card" content="summary_large_image">/);
    assert.match(document, /<meta name="twitter:image" content="https:\/\/apecerto\.com\/assets\/media\/ba920d6e62cf7c3ca6f8\.jpg">/);
  }
  const moaPoster = await readFile(join(root, 'dist/assets/media/fac779ec499e72abf87e.jpg'));
  assert.ok(moaPoster.length <= 300000, 'o poster do MOA deve permanecer abaixo de 300 KB');
  await access(join(root, 'dist/favicon.svg'));
  await access(join(root, 'dist/favicon.ico'));
  await access(join(root, 'dist/.image-slots.state.json'));
});

test('bundles publicados não apontam para source maps ausentes', async () => {
  const version = JSON.parse(await readFile(join(root, 'dist/version.json'), 'utf8'));
  const scripts = version.artifacts.filter(artifact => /^assets\/bundle\/[^/]+\.js$/.test(artifact.path));
  assert.ok(scripts.length > 0);
  for (const script of scripts) {
    const source = await readFile(join(root, 'dist', script.path), 'utf8');
    assert.doesNotMatch(source, /sourceMappingURL=/, script.path + ' não pode provocar 404 de mapa ausente');
  }
});

test('build publica somente o subconjunto de ícones usado pelo site', async () => {
  const shell = await readFile(join(root, 'dist/index.html'), 'utf8');
  const manifest = JSON.parse(shell.match(/<script type="__bundler\/manifest">\s*([\s\S]*?)\s*<\/script>/)[1]);
  const lucide = manifest['d76081c9-365b-497c-a53c-e3f94767ebc9'];
  assert.ok(lucide && lucide.url, 'o UUID do Lucide deve continuar resolvível pelo runtime do design');
  const source = await readFile(join(root, 'dist', lucide.url.replace(/^\/+/, '')), 'utf8');
  assert.ok(Buffer.byteLength(source) < 30000, 'o subconjunto Lucide deve ficar abaixo de 30 KB');
  assert.match(source, /createIcons/);
  assert.match(source, /bed-double/);
  assert.doesNotMatch(source, /AArrowDown/);
});

test('Leaflet não pertence ao orçamento inicial', async () => {
  const version = JSON.parse(await readFile(join(root, 'dist/version.json'), 'utf8'));
  const shell = await readFile(join(root, 'dist/index.html'), 'utf8');
  const manifest = JSON.parse(shell.match(/<script type="__bundler\/manifest">\s*([\s\S]*?)\s*<\/script>/)[1]);
  const leafletUrl = manifest['4e06a80d-cb55-4dd3-8f0d-a47dbcf50aa4'].url;
  assert.ok(!version.initialAssets.includes(leafletUrl), 'o mapa deve baixar a biblioteca apenas perto da área visível');
  for (const uuid of [
    '423dc31e-8e4e-4cd6-bed6-eee6085ba021',
    '99ceddc7-e4c8-4fd7-967d-62da1c6abea2',
    '6ca08ada-3f93-4b37-86c8-e0f15e8940d3',
  ]) {
    assert.ok(version.initialAssets.includes(manifest[uuid].url), 'o orçamento deve contabilizar ' + uuid);
  }
});

test('Render aguarda CI e envia headers seguros e cache imutavel', async () => {
  const render = await readFile(join(root, 'render.yaml'), 'utf8');
  const workflow = await readFile(join(root, '.github/workflows/validate-site.yml'), 'utf8');
  const localServer = await readFile(join(root, 'scripts/serve-dist.mjs'), 'utf8');
  assert.match(render, /buildCommand: npm run ci/);
  assert.match(render, /autoDeployTrigger: checksPass/);
  assert.match(localServer, /public, max-age=31536000, immutable/, 'a medição local deve espelhar o cache de assets do Render');
  assert.match(localServer, /public, max-age=0, must-revalidate/, 'documentos locais devem revalidar sem bloquear o bfcache');
  assert.doesNotMatch(render, /source: \/imovel\/\*/);
  assert.doesNotMatch(render, /source: \/sitemap-catalogo\.xml/);
  assert.doesNotMatch(render, /source: \/sitemap\.xml\s+destination:/);
  assert.match(render, /path: \/sitemap\.xml\s+name: Content-Type\s+value: application\/xml; charset=utf-8/);
  assert.match(render, /path: \/sitemap-catalogo\.xml\s+name: Content-Type\s+value: application\/xml; charset=utf-8/);
  assert.match(render, /Cache-Control[\s\S]*max-age=31536000, immutable/);
  for (const header of [
    'Strict-Transport-Security',
    'Referrer-Policy',
    'Permissions-Policy',
    'X-Frame-Options',
    'X-Content-Type-Options',
    'Content-Security-Policy-Report-Only',
  ]) assert.ok(render.includes('name: ' + header), header + ' deve estar no Blueprint');
  assert.match(render, /frame-ancestors 'none'/);
  assert.doesNotMatch(
    render,
    /Content-Security-Policy-Report-Only[\s\S]*upgrade-insecure-requests/,
    'upgrade-insecure-requests é ignorado em CSP report-only e gera erro no navegador',
  );
  assert.match(
    render,
    /script-src 'self' 'unsafe-inline' 'unsafe-eval'/,
    'o CSP report-only deve declarar a avaliação dinâmica exigida pelo runtime do Cloud Design',
  );
  assert.match(render, /diaegvfveqezispcthwk\.supabase\.co|\*\.supabase\.co/);
  assert.match(render, /googletagmanager\.com/);
  assert.match(render, /connect\.facebook\.net/);
  assert.match(render, /clarity\.ms/);
  assert.match(render, /fonts\.googleapis\.com/);
  assert.match(render, /tile\.openstreetmap\.org/);
  assert.match(workflow, /run: npm run ci/);
  assert.match(workflow, /workflow_dispatch:/);
});

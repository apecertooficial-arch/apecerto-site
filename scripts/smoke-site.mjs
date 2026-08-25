// Smoke test HTTP local do pacote pronto. Nao acessa a internet e exercita o
// mesmo formato de arquivos/rotas que o host estatico publica.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { readDeployConfig, safeDistPath } from './site-build-lib.mjs';

const root = process.cwd();
const distDir = resolve(root, process.env.APECERTO_DIST_DIR || 'dist');
const config = await readDeployConfig(root, process.env.APECERTO_DEPLOY_CONFIG || 'site.deploy.json');
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const dynamic = (config.dynamicRoutes || []).find(route => {
      if (!route.pattern.endsWith('*')) return url.pathname === route.pattern;
      return url.pathname.startsWith(route.pattern.slice(0, -1));
    });
    let relative = dynamic ? dynamic.destination.replace(/^\/+/, '') : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!dynamic && (!relative || url.pathname.endsWith('/'))) relative += 'index.html';
    const file = safeDistPath(distDir, relative);
    const body = await readFile(file);
    const contentType = mime[extname(file)] || 'application/octet-stream';
    const acceptsGzip = /(?:^|,)\s*gzip\s*(?:,|$)/i.test(String(request.headers['accept-encoding'] || ''));
    const compressible = /^(?:text\/|font\/|application\/(?:javascript|json|xml))/.test(contentType);
    if (acceptsGzip && compressible && body.length >= 1024) {
      response.writeHead(200, { 'content-type': contentType, 'content-encoding': 'gzip', vary: 'Accept-Encoding' });
      response.end(gzipSync(body, { level: 9 }));
    } else {
      response.writeHead(200, { 'content-type': contentType });
      response.end(body);
    }
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

await new Promise((accept, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', accept);
});

const address = server.address();
const base = 'http://127.0.0.1:' + address.port;
const errors = [];
const metrics = {};

try {
  const versionResponse = await fetch(base + '/version.json', { signal: AbortSignal.timeout(5000) });
  if (!versionResponse.ok) errors.push('/version.json respondeu ' + versionResponse.status);
  const version = await versionResponse.json().catch(() => null);
  if (!version?.version || !version?.sourceFingerprint || !version?.artifactFingerprint) errors.push('/version.json nao contem os fingerprints obrigatorios');

  const sitemapIndexResponse = await fetch(base + (config.seo?.sitemapIndexPath || '/sitemap.xml'), { signal: AbortSignal.timeout(5000) });
  const sitemapIndex = await sitemapIndexResponse.text();
  const expectedCatalogUrl = new URL(config.seo?.sitemapCatalogPath || '/sitemap-catalogo.xml', config.origin).href;
  if (sitemapIndexResponse.status !== 200) errors.push('/sitemap.xml respondeu ' + sitemapIndexResponse.status);
  if (!sitemapIndexResponse.headers.get('content-type')?.startsWith('application/xml')) errors.push('/sitemap.xml respondeu content-type incorreto');
  if (!/<sitemapindex\b/i.test(sitemapIndex) || /<urlset\b/i.test(sitemapIndex) || !sitemapIndex.includes('<loc>' + expectedCatalogUrl + '</loc>')) {
    errors.push('/sitemap.xml nao respondeu o indice do catalogo dinamico');
  }
  const localCatalog = await fetch(base + (config.seo?.sitemapCatalogPath || '/sitemap-catalogo.xml'), { signal: AbortSignal.timeout(5000) });
  if (localCatalog.status !== 404) errors.push('catalogo dinamico nao pode existir como arquivo fisico no pacote');

  const budgets = config.budgets || {};
  const totalBytes = (version?.artifacts || []).reduce((sum, artifact) => sum + Number(artifact.bytes || 0), 0);
  if (budgets.maxTotalBytes && totalBytes > budgets.maxTotalBytes) errors.push('pacote excedeu o limite total: ' + totalBytes + ' > ' + budgets.maxTotalBytes + ' bytes');
  for (const artifact of version?.artifacts || []) {
    if (budgets.maxSingleAssetBytes && artifact.bytes > budgets.maxSingleAssetBytes) errors.push(artifact.path + ' excedeu o limite individual: ' + artifact.bytes + ' bytes');
    if (!/\.(?:css|html|js|json|svg|txt|xml)$/i.test(artifact.path) || artifact.bytes < 1024 || !budgets.maxGzipRatio) continue;
    const bytes = await readFile(safeDistPath(distDir, artifact.path));
    const ratio = gzipSync(bytes, { level: 9 }).length / bytes.length;
    if (ratio > budgets.maxGzipRatio) errors.push(artifact.path + ' comprime pouco: razao gzip ' + ratio.toFixed(3) + ' > ' + budgets.maxGzipRatio);
  }

  if (version?.templatePath) {
    const templateBytes = await readFile(safeDistPath(distDir, version.templatePath.replace(/^\/+/, '')));
    metrics.templateRawBytes = templateBytes.length;
    metrics.templateGzipBytes = gzipSync(templateBytes, { level: 9 }).length;
    if (budgets.maxTemplateBytes && templateBytes.length > budgets.maxTemplateBytes) errors.push('template externo excedeu o limite: ' + templateBytes.length + ' > ' + budgets.maxTemplateBytes + ' bytes');
  }

  const shellBytes = await readFile(safeDistPath(distDir, 'index.html'));
  metrics.htmlRawBytes = shellBytes.length;
  metrics.htmlGzipBytes = gzipSync(shellBytes, { level: 9 }).length;
  let initialTransferBytes = metrics.htmlGzipBytes;
  for (const asset of version?.initialAssets || []) {
    const relative = asset.replace(/^\/+/, '');
    const bytes = await readFile(safeDistPath(distDir, relative));
    const alreadyCompressed = /\.(?:avif|gif|jpe?g|png|webp)$/i.test(relative);
    initialTransferBytes += alreadyCompressed ? bytes.length : gzipSync(bytes, { level: 9 }).length;
    const response = await fetch(base + asset, { headers: { 'Accept-Encoding': 'gzip' }, signal: AbortSignal.timeout(5000) });
    if (response.status !== 200) errors.push('asset inicial respondeu ' + response.status + ': ' + asset);
    if (!alreadyCompressed && bytes.length >= 1024 && response.headers.get('content-encoding') !== 'gzip') errors.push('asset inicial sem gzip: ' + asset);
  }
  metrics.initialTransferBytes = initialTransferBytes;
  if (budgets.maxInitialTransferBytes && initialTransferBytes > budgets.maxInitialTransferBytes) errors.push('transferencia inicial excedeu o limite: ' + initialTransferBytes + ' > ' + budgets.maxInitialTransferBytes + ' bytes');

  for (const route of config.routes) {
    const response = await fetch(base + route.path, { headers: { 'Accept-Encoding': 'gzip' }, signal: AbortSignal.timeout(5000) });
    const body = await response.text();
    if (response.status !== 200) errors.push(route.path + ' respondeu ' + response.status);
    if (!response.headers.get('content-type')?.startsWith('text/html')) errors.push(route.path + ' respondeu content-type incorreto');
    if (response.headers.get('content-encoding') !== 'gzip') errors.push(route.path + ' nao respondeu com compressao gzip');
    if (!/^<!doctype html>/i.test(body.trimStart())) errors.push(route.path + ' nao respondeu HTML completo');
    if (version?.version && !body.includes('name="apecerto-version" content="' + version.version + '"')) errors.push(route.path + ' respondeu versao divergente');
    const htmlBytes = Buffer.byteLength(body);
    if (budgets.maxHtmlBytes && htmlBytes > budgets.maxHtmlBytes) errors.push(route.path + ' excedeu o limite de HTML: ' + htmlBytes + ' bytes');
    const htmlGzipBytes = gzipSync(Buffer.from(body), { level: 9 }).length;
    if (budgets.maxHtmlGzipBytes && htmlGzipBytes > budgets.maxHtmlGzipBytes) errors.push(route.path + ' excedeu o limite de HTML gzip: ' + htmlGzipBytes + ' bytes');
    for (const image of body.matchAll(/data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)/g)) {
      const inlineBytes = Buffer.from(image[1], 'base64').length;
      if (budgets.maxInlineImageBytes && inlineBytes > budgets.maxInlineImageBytes) errors.push(route.path + ' contem imagem inline de ' + inlineBytes + ' bytes');
    }
  }

  for (const route of config.disabledRoutes || []) {
    const response = await fetch(base + route, { signal: AbortSignal.timeout(5000), redirect: 'manual' });
    if (response.status !== 404) errors.push('rota desativada respondeu ' + response.status + ': ' + route);
  }

  for (const route of config.dynamicRoutes || []) {
    const response = await fetch(base + route.smokePath, { signal: AbortSignal.timeout(5000), redirect: 'manual' });
    const body = await response.text();
    if (response.status !== 200) errors.push(route.smokePath + ' respondeu ' + response.status);
    if (!/^<!doctype html>/i.test(body.trimStart())) errors.push(route.smokePath + ' nao recebeu o shell da aplicacao');
    if (version?.version && !body.includes('name="apecerto-version" content="' + version.version + '"')) errors.push(route.smokePath + ' recebeu versao divergente');
  }

  const missing = await fetch(base + '/__apecerto_smoke_missing__', { signal: AbortSignal.timeout(5000), redirect: 'manual' });
  if (missing.status !== 404) errors.push('caminho inexistente respondeu ' + missing.status);
} finally {
  await new Promise(resolveClose => server.close(resolveClose));
}

if (errors.length) {
  console.error('SMOKE FALHOU (' + errors.length + ' problema(s)):');
  for (const error of errors) console.error(' - ' + error);
  process.exitCode = 1;
} else {
  console.log('smoke HTTP aprovado:', config.routes.length + ' rotas ativas e ' + (config.disabledRoutes || []).length + ' desativadas', '| HTML', metrics.htmlRawBytes + ' B raw / ' + metrics.htmlGzipBytes + ' B gzip', '| inicial', metrics.initialTransferBytes + ' B');
}

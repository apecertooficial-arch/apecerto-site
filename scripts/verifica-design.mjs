// Verificacao bloqueante do pacote que sera publicado. Qualquer divergencia de
// SHA, marcador obrigatorio, rota, sitemap ou link local encerra com codigo 1.
import { access, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  artifactManifest,
  readDeployConfig,
  safeDistPath,
  sourceVersion,
} from './site-build-lib.mjs';

const existe = path => access(path).then(() => true, () => false);
const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function metaContent(html, name) {
  const tag = html.match(new RegExp('<meta\\b[^>]*\\bname=["\\\']' + escapeRegex(name) + '["\\\'][^>]*>', 'i'));
  if (!tag) return null;
  return tag[0].match(/\bcontent=["']([^"']*)["']/i)?.[1] ?? null;
}

function canonical(html) {
  const tag = html.match(/<link\b[^>]*\brel=["']canonical["'][^>]*>/i);
  return tag?.[0].match(/\bhref=["']([^"']+)["']/i)?.[1] ?? null;
}

function bundlerPayload(html, type) {
  const match = html.match(new RegExp('<script type="__bundler/' + escapeRegex(type) + '">\\s*([\\s\\S]*?)\\s*<\\/script>'));
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

function rewriteDestination(renderYaml, source) {
  const pattern = new RegExp(
    '-\\s+type:\\s*rewrite\\s*\\n\\s*source:\\s*' + escapeRegex(source) + '\\s*\\n\\s*destination:\\s*([^\\s#]+)',
    'i',
  );
  return renderYaml.match(pattern)?.[1] ?? null;
}

function headerValue(renderYaml, path, name) {
  const pattern = new RegExp(
    '-\\s+path:\\s*' + escapeRegex(path) + '\\s*\\n\\s*name:\\s*' + escapeRegex(name) + '\\s*\\n\\s*value:\\s*([^\\r\\n#]+)',
    'i',
  );
  return renderYaml.match(pattern)?.[1]?.trim() ?? null;
}

async function expandedHtml(html, distDir) {
  const match = html.match(/<script type="__bundler\/template">\s*([\s\S]*?)\s*<\/script>/);
  const shell = html.replace(/<script type="__bundler\/(?:manifest|template)">[\s\S]*?<\/script>/g, '');
  if (!match) return shell;
  try {
    const payload = JSON.parse(match[1]);
    if (typeof payload === 'string') return shell + '\n' + payload;
    if (payload && typeof payload.url === 'string') {
      const template = await readFile(safeDistPath(distDir, payload.url.replace(/^\/+/, '')), 'utf8');
      return shell + '\n' + template;
    }
    return shell;
  } catch {
    return shell;
  }
}

function attributes(html) {
  const values = [];
  const regex = /\b(href|src|srcset)\s*=\s*(["'])(.*?)\2/gi;
  let match;
  while ((match = regex.exec(html))) {
    const attribute = match[1].toLowerCase();
    const raw = match[3].replaceAll('&amp;', '&');
    if (attribute !== 'srcset' || /^data:/i.test(raw)) values.push({ attribute, value: raw });
    else for (const candidate of raw.split(',')) values.push({ attribute, value: candidate.trim().split(/\s+/)[0] });
  }
  return values;
}

async function validateLinks({ config, distDir, routeDocuments, errors }) {
  const byPath = new Map(config.routes.map(route => [route.path, route]));
  const disabled = new Set(config.disabledRoutes || []);

  for (const route of config.routes) {
    const source = routeDocuments.get(route.path);
    for (const link of attributes(source)) {
      const value = link.value.trim();
      if (!value || value.includes('{{') || value.includes("' +") || value.includes("+ '") || value === '#') continue;
      // O pacote-base referencia recursos incorporados pelo UUID do manifesto;
      // eles nao sao requisicoes HTTP e sao resolvidos pelo runtime do bundle.
      if (/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value)) continue;
      if (/^javascript:/i.test(value)) {
        errors.push('link inseguro em ' + route.path + ': ' + value);
        continue;
      }
      if (/^(?:mailto|tel|data|blob):/i.test(value)) continue;

      let url;
      const routeBase = new URL(route.path, config.origin).href;
      try { url = new URL(value, routeBase); }
      catch { errors.push('link invalido em ' + route.path + ': ' + value); continue; }
      if (url.origin !== config.origin) continue;

      const normalizedPath = url.pathname.endsWith('/') ? url.pathname : url.pathname;
      if (disabled.has(normalizedPath.endsWith('/') ? normalizedPath : normalizedPath + '/')) {
        errors.push('link aponta para rota desativada em ' + route.path + ': ' + value);
        continue;
      }

      const dynamic = (config.dynamicRoutes || []).find(candidate => candidate.pattern.endsWith('*')
        ? url.pathname.startsWith(candidate.pattern.slice(0, -1))
        : url.pathname === candidate.pattern);
      if (dynamic) {
        if (!(await existe(safeDistPath(distDir, dynamic.destination.replace(/^\/+/, ''))))) errors.push('destino da rota dinamica ausente: ' + dynamic.pattern);
        continue;
      }

      let relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      if (!relative || url.pathname.endsWith('/')) relative += 'index.html';
      const target = safeDistPath(distDir, relative);
      if (!(await existe(target))) {
        errors.push('link local quebrado em ' + route.path + ': ' + value + ' -> ' + relative);
        continue;
      }

      if (url.hash && url.hash !== '#') {
        const targetRoutePath = url.pathname.endsWith('/') ? url.pathname : null;
        const targetRoute = targetRoutePath ? byPath.get(targetRoutePath) : null;
        if (targetRoute) {
          const targetHtml = routeDocuments.get(targetRoute.path);
          const id = decodeURIComponent(url.hash.slice(1));
          const hasId = new RegExp('\\bid=["\\\']' + escapeRegex(id) + '["\\\']').test(targetHtml);
          if (!hasId) errors.push('ancora ausente em ' + value + ' (referenciada por ' + route.path + ')');
        }
      }
    }
  }
}

export async function verifySite({
  root = process.cwd(),
  distDir = process.env.APECERTO_DIST_DIR || 'dist',
  configPath = process.env.APECERTO_DEPLOY_CONFIG || 'site.deploy.json',
} = {}) {
  const absoluteDist = resolve(root, distDir);
  const errors = [];
  const config = await readDeployConfig(root, configPath);
  const source = await sourceVersion(root, config);
  let version;

  try { version = JSON.parse(await readFile(safeDistPath(absoluteDist, 'version.json'), 'utf8')); }
  catch (error) { errors.push('version.json ausente ou invalido: ' + error.message); }

  if (version) {
    if (version.sourceFingerprint !== source.fingerprint) errors.push('SHA das fontes divergiu: version.json=' + version.sourceFingerprint + ', atual=' + source.fingerprint);
    if (version.designSha256 !== source.designSha256) errors.push('SHA do design divergiu: version.json=' + version.designSha256 + ', atual=' + source.designSha256);
    if (version.version !== source.version) errors.push('versao curta divergiu: version.json=' + version.version + ', atual=' + source.version);
    for (const sourceAsset of config.versionedAssets || []) {
      const publicSource = '/' + sourceAsset.replace(/^\/+/, '');
      const deployed = version.assetMap?.[publicSource];
      const extension = publicSource.slice(publicSource.lastIndexOf('.'));
      const stem = publicSource.slice(0, -extension.length);
      if (!deployed || !new RegExp('^' + escapeRegex(stem) + '\\.[a-f0-9]{12}' + escapeRegex(extension) + '$').test(deployed)) {
        errors.push('asset sem versao por conteudo: ' + sourceAsset);
      } else if (!(await existe(safeDistPath(absoluteDist, deployed.replace(/^\/+/, ''))))) {
        errors.push('asset versionado ausente: ' + deployed);
      }
      if (await existe(safeDistPath(absoluteDist, sourceAsset))) errors.push('asset mutavel ainda publicado: ' + sourceAsset);
    }
    if (!version.templatePath || !(await existe(safeDistPath(absoluteDist, version.templatePath.replace(/^\/+/, ''))))) errors.push('template externo ausente');
    if (!Array.isArray(version.initialAssets) || !version.initialAssets.length) errors.push('lista de transferencia inicial ausente');
    else for (const asset of version.initialAssets) {
      if (!/^\/assets\//.test(asset) || !(await existe(safeDistPath(absoluteDist, asset.replace(/^\/+/, ''))))) errors.push('asset inicial ausente: ' + asset);
    }
  }

  for (const required of config.requiredFiles || []) {
    if (!(await existe(safeDistPath(absoluteDist, required)))) errors.push('arquivo obrigatorio ausente: ' + required);
  }

  const routeDocuments = new Map();
  for (const route of config.routes) {
    const file = safeDistPath(absoluteDist, route.file);
    if (!(await existe(file))) {
      errors.push('rota ausente: ' + route.path + ' -> ' + route.file);
      continue;
    }
    const html = await readFile(file, 'utf8');
    const expanded = await expandedHtml(html, absoluteDist);
    routeDocuments.set(route.path, expanded);
    if (!/^<!doctype html>/i.test(html.trimStart())) errors.push(route.path + ': documento nao inicia com DOCTYPE');
    if (!/<title>[^<]+<\/title>/i.test(html)) errors.push(route.path + ': title ausente ou vazio');
    if (canonical(html) !== route.canonical) errors.push(route.path + ': canonical invalida (esperada ' + route.canonical + ')');
    if (metaContent(html, 'apecerto-version') !== source.version) errors.push(route.path + ': meta apecerto-version ausente ou divergente');
    if (metaContent(html, 'apecerto-design-sha256') !== source.designSha256) errors.push(route.path + ': meta SHA do design ausente ou divergente');
    for (const marker of route.requiredMarkers || []) {
      if (!expanded.includes(marker)) errors.push(route.path + ': marcador obrigatorio ausente: ' + JSON.stringify(marker));
    }
    for (const marker of config.forbiddenMarkers || []) {
      if (expanded.includes(marker)) errors.push(route.path + ': marcador proibido presente: ' + JSON.stringify(marker));
    }
  }

  const staticSitemapFile = config.seo?.sitemapStaticGateFile || 'sitemap-static.xml';
  const sitemapPath = safeDistPath(absoluteDist, staticSitemapFile);
  let staticSitemap = '';
  try { staticSitemap = await readFile(sitemapPath, 'utf8'); }
  catch (error) { errors.push(staticSitemapFile + ' ilegivel: ' + error.message); }
  const sitemapUrls = [...staticSitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  const expectedUrls = config.routes.map(route => route.canonical);
  if (JSON.stringify(sitemapUrls) !== JSON.stringify(expectedUrls)) errors.push('sitemap estatico de gate divergiu das rotas ativas');

  const seo = config.seo || {};
  const sitemapIndexPath = seo.sitemapIndexPath || '/sitemap.xml';
  const sitemapIndexFile = seo.sitemapIndexFile || sitemapIndexPath.replace(/^\/+/, '');
  const sitemapCatalogPath = seo.sitemapCatalogPath || '/sitemap-catalogo.xml';
  const sitemapCatalogUrl = new URL(sitemapCatalogPath, config.origin).href;
  let sitemapIndex = '';
  try { sitemapIndex = await readFile(safeDistPath(absoluteDist, sitemapIndexFile.replace(/^\/+/, '')), 'utf8'); }
  catch (error) { errors.push(sitemapIndexFile + ' ilegivel: ' + error.message); }
  const indexUrls = [...sitemapIndex.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  if (!/<sitemapindex\b[^>]*xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/i.test(sitemapIndex)
      || /<urlset\b/i.test(sitemapIndex)
      || JSON.stringify(indexUrls) !== JSON.stringify([sitemapCatalogUrl])) {
    errors.push('sitemap.xml deve ser um indice fisico com referencia unica ao catalogo dinamico');
  }
  if (await existe(safeDistPath(absoluteDist, sitemapCatalogPath.replace(/^\/+/, '')))) {
    errors.push('sitemap-catalogo.xml fisico bloquearia o rewrite dinamico do Render');
  }

  const robots = await readFile(safeDistPath(absoluteDist, 'robots.txt'), 'utf8').catch(() => '');
  if (!robots.includes(new URL(sitemapIndexPath, config.origin).href)) errors.push('robots.txt nao aponta para o sitemap index oficial');

  const render = await readFile(resolve(root, 'render.yaml'), 'utf8').catch(() => '');
  if (rewriteDestination(render, sitemapIndexPath)) errors.push('sitemap index fisico nao pode ter rewrite no Render');
  const sitemapDestination = rewriteDestination(render, sitemapCatalogPath);
  if (sitemapDestination !== seo.sitemapEdgeDestination) errors.push('rewrite do catalogo dinamico divergiu do contrato de deploy');
  for (const path of [sitemapIndexPath, sitemapCatalogPath]) {
    if (headerValue(render, path, 'Content-Type') !== 'application/xml; charset=utf-8') {
      errors.push('header XML ausente no Render: ' + path);
    }
  }
  const propertyDestination = rewriteDestination(render, seo.propertyPath || '/imovel/*');
  if (propertyDestination !== (seo.propertyLocalDestination || '/index.html')) errors.push('rota de imovel deve permanecer no shell estatico ate existir custom domain da Edge');
  if (seo.propertyEdgeEnabled !== false || seo.propertyEdgeRequiresCustomDomain !== true) errors.push('gate de HTML da Edge deve permanecer desativado e exigir custom domain');
  if (/^https:\/\/[^/]+\.supabase\.co\//i.test(propertyDestination || '')) errors.push('URL padrao do Supabase nao pode servir o HTML das fichas como rewrite');

  for (const route of config.disabledRoutes || []) {
    const relative = route.replace(/^\/+|\/+$/g, '');
    if (relative && await existe(safeDistPath(absoluteDist, relative))) errors.push('rota desativada ainda publicada: ' + route);
    if (staticSitemap.includes(config.origin + route.replace(/^\/+/, ''))) errors.push('rota desativada ainda presente no sitemap: ' + route);
  }
  const rootDocument = routeDocuments.get('/');
  const rootHtml = await readFile(safeDistPath(absoluteDist, 'index.html'), 'utf8').catch(() => '');
  const templatePayload = bundlerPayload(rootHtml, 'template');
  if (!templatePayload || templatePayload.url !== version?.templatePath) errors.push('shell nao aponta para o template versionado');
  const bundleManifest = bundlerPayload(rootHtml, 'manifest');
  if (!bundleManifest || !Object.keys(bundleManifest).length) errors.push('manifesto externo do bundle ausente ou invalido');
  else for (const [uuid, entry] of Object.entries(bundleManifest)) {
    if (entry.data) errors.push('asset do bundle voltou a ficar inline: ' + uuid);
    if (!/^\/assets\/(?:bundle|bundle-optimized)\/[a-f0-9]{20}\.[a-z0-9]+$/i.test(entry.url || '')) errors.push('URL de asset do bundle invalida: ' + uuid);
    else if (!(await existe(safeDistPath(absoluteDist, entry.url.replace(/^\/+/, ''))))) errors.push('asset do bundle ausente: ' + entry.url);
  }
  for (const route of config.dynamicRoutes || []) {
    const destination = route.destination.replace(/^\/+/, '');
    if (!(await existe(safeDistPath(absoluteDist, destination)))) errors.push('destino da rota dinamica ausente: ' + route.pattern + ' -> ' + route.destination);
    for (const marker of route.requiredMarkers || []) {
      if (!rootDocument?.includes(marker)) errors.push('rota dinamica ' + route.pattern + ': marcador ausente: ' + JSON.stringify(marker));
    }
  }
  if (await existe(safeDistPath(absoluteDist, 'diagnostico.txt'))) errors.push('diagnostico interno nao pode ser publicado');

  let artifacts;
  try { artifacts = await artifactManifest(absoluteDist); }
  catch (error) { errors.push('nao foi possivel calcular SHA dos artefatos: ' + error.message); }
  if (version && artifacts) {
    if (version.artifactFingerprint !== artifacts.fingerprint) errors.push('SHA dos artefatos divergiu: version.json=' + version.artifactFingerprint + ', atual=' + artifacts.fingerprint);
    if (JSON.stringify(version.artifacts) !== JSON.stringify(artifacts.files)) errors.push('manifesto de artefatos divergiu do conteudo de dist');
    const htmlFiles = artifacts.files.filter(item => item.path === 'index.html' || item.path.endsWith('/index.html')).map(item => item.path).sort();
    const expectedHtml = config.routes.map(route => route.file).sort();
    if (JSON.stringify(htmlFiles) !== JSON.stringify(expectedHtml)) errors.push('arquivos HTML publicados divergem das rotas declaradas: ' + htmlFiles.join(', '));
    if (JSON.stringify(version.routes) !== JSON.stringify(config.routes.map(route => route.path))) errors.push('version.json divergiu das rotas declaradas');
  }

  if (routeDocuments.size === config.routes.length) await validateLinks({ config, distDir: absoluteDist, routeDocuments, errors });
  return { errors, source, config };
}

async function main() {
  const result = await verifySite();
  if (result.errors.length) {
    console.error('VERIFICACAO FALHOU (' + result.errors.length + ' problema(s)):');
    for (const error of result.errors) console.error(' - ' + error);
    process.exitCode = 1;
    return;
  }
  console.log('verificacao bloqueante aprovada:', result.source.version, '| ' + result.config.routes.length + ' rotas');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error('VERIFICACAO FALHOU:', error.message);
    process.exitCode = 1;
  });
}

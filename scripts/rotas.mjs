// Finaliza o pacote estatico: remove rotas desativadas, gera o sitemap de gate
// local, publica um sitemap index estavel e sela cada HTML com a versao exata
// das fontes. O catalogo dinamico vive em /sitemap-catalogo.xml via Edge.
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, relative, resolve, sep } from 'node:path';
import {
  artifactManifest,
  readDeployConfig,
  safeDistPath,
  sha256,
  sourceVersion,
} from './site-build-lib.mjs';

const root = process.cwd();
const distDir = resolve(root, process.env.APECERTO_DIST_DIR || 'dist');
const config = await readDeployConfig(root, process.env.APECERTO_DEPLOY_CONFIG || 'site.deploy.json');
const source = await sourceVersion(root, config);
const existe = path => access(path).then(() => true, () => false);

const escapeXml = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const meta = [
  '<meta name="apecerto-version" content="' + source.version + '">',
  '<meta name="apecerto-design-sha256" content="' + source.designSha256 + '">',
].join('\n  ');

const selar = (html, file) => {
  let out = html
    .replace(/\s*<meta name="apecerto-version"[^>]*>/g, '')
    .replace(/\s*<meta name="apecerto-design(?:-sha256)?"[^>]*>/g, '');
  if (!out.includes('</head>')) throw new Error(file + ': </head> ausente');
  out = out.replace('</head>', '  ' + meta + '\n</head>');
  return out;
};

const trocaTag = (html, pattern, replacement, label) => {
  if (!pattern.test(html)) throw new Error(label + ': tag obrigatoria ausente');
  return html.replace(pattern, replacement);
};

const trocaOuInsereNoHead = (html, pattern, replacement, label) => {
  if (pattern.test(html)) return html.replace(pattern, replacement);
  if (!html.includes('</head>')) throw new Error(label + ': </head> ausente');
  return html.replace('</head>', '  ' + replacement + '\n</head>');
};

const aplicarHeadDaRota = (html, route) => {
  let out = html;
  out = trocaTag(out, /<title>[^<]*<\/title>/i, '<title>' + route.title + '</title>', route.path + ' title');
  out = trocaTag(out, /<link\s+rel="canonical"\s+href="[^"]*">/i, '<link rel="canonical" href="' + route.canonical + '">', route.path + ' canonical');
  out = trocaTag(out, /<meta\s+name="description"\s+content="[^"]*">/i, '<meta name="description" content="' + route.description + '">', route.path + ' description');
  out = trocaOuInsereNoHead(out, /<meta\s+property="og:url"\s+content="[^"]*">/i, '<meta property="og:url" content="' + route.canonical + '">', route.path + ' og:url');
  out = trocaOuInsereNoHead(out, /<meta\s+property="og:title"\s+content="[^"]*">/i, '<meta property="og:title" content="' + route.title + '">', route.path + ' og:title');
  out = trocaOuInsereNoHead(out, /<meta\s+property="og:description"\s+content="[^"]*">/i, '<meta property="og:description" content="' + route.description + '">', route.path + ' og:description');
  return out;
};

async function arquivosRecursivos(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const path = resolve(dir, entry.name);
    return entry.isDirectory() ? arquivosRecursivos(path) : [path];
  }));
  return nested.flat().sort();
}

async function versionarAssets() {
  const assetDir = safeDistPath(distDir, 'assets');
  const replacements = new Map();
  for (const file of await arquivosRecursivos(assetDir)) {
    const relativePath = relative(assetDir, file).split(sep).join('/');
    // Assets extraidos do bundle ja usam o SHA no proprio nome.
    if (/^(?:media|bundle|bundle-optimized)\/[a-f0-9]{20}\.[a-z0-9]+$/i.test(relativePath)) continue;
    const bytes = await readFile(file);
    const extension = extname(relativePath);
    const name = basename(relativePath, extension);
    const hash = sha256(bytes).slice(0, 12);
    const versionedRelative = (dirname(relativePath) === '.' ? '' : dirname(relativePath) + '/') + name + '.' + hash + extension;
    const versionedFile = safeDistPath(assetDir, versionedRelative);
    await mkdir(dirname(versionedFile), { recursive: true });
    await writeFile(versionedFile, bytes);
    await rm(file);
    replacements.set('/assets/' + relativePath, '/assets/' + versionedRelative);
  }
  return replacements;
}

const aplicarAssetsVersionados = (text, replacements) => {
  let out = text;
  for (const [from, to] of replacements) out = out.replaceAll(from, to);
  return out;
};

for (const route of config.disabledRoutes || []) {
  const relative = route.replace(/^\/+|\/+$/g, '');
  if (relative) await rm(safeDistPath(distDir, relative), { recursive: true, force: true });
}
await rm(safeDistPath(distDir, 'diagnostico.txt'), { force: true });
await rm(safeDistPath(distDir, 'sitemap.xml'), { force: true });
await rm(safeDistPath(distDir, 'sitemap-catalogo.xml'), { force: true });
const assetMap = await versionarAssets();
const buildInputPath = safeDistPath(distDir, 'build-input.json');
const buildInput = JSON.parse(await readFile(buildInputPath, 'utf8'));
await rm(buildInputPath);
const deployedAsset = path => assetMap.get(path) || path;
const initialAssets = [...new Set((buildInput.initialAssets || []).map(deployedAsset))];
const templatePath = deployedAsset(buildInput.templatePath);

for (const route of config.routes) {
  const file = safeDistPath(distDir, route.file);
  if (route.copyFrom) {
    const sourceFile = safeDistPath(distDir, route.copyFrom);
    if (!(await existe(sourceFile))) throw new Error('fonte da rota ausente: ' + route.path + ' -> ' + route.copyFrom);
    if (!route.title || !route.description) throw new Error('rota copiada sem title/description: ' + route.path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, aplicarHeadDaRota(await readFile(sourceFile, 'utf8'), route));
  } else if (await existe(file)) {
    await writeFile(file, aplicarAssetsVersionados(await readFile(file, 'utf8'), assetMap));
  }
  if (!(await existe(file))) throw new Error('rota sem arquivo: ' + route.path + ' -> ' + route.file);
  await writeFile(file, selar(await readFile(file, 'utf8'), route.file));
}

const urls = config.routes.map(route => [
  '  <url>',
  '    <loc>' + escapeXml(route.canonical) + '</loc>',
  '    <changefreq>' + escapeXml(route.changefreq) + '</changefreq>',
  '    <priority>' + escapeXml(route.priority) + '</priority>',
  '  </url>',
].join('\n'));
const sitemapStatic = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls,
  '</urlset>',
  '',
].join('\n');
const seo = config.seo || {};
const sitemapStaticFile = seo.sitemapStaticGateFile || 'sitemap-static.xml';
const sitemapIndexFile = seo.sitemapIndexFile || 'sitemap.xml';
const sitemapCatalogPath = seo.sitemapCatalogPath || '/sitemap-catalogo.xml';
const sitemapCatalogUrl = new URL(sitemapCatalogPath, config.origin).href;
const sitemapIndex = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  '  <sitemap>',
  '    <loc>' + escapeXml(sitemapCatalogUrl) + '</loc>',
  '  </sitemap>',
  '</sitemapindex>',
  '',
].join('\n');
await writeFile(safeDistPath(distDir, sitemapStaticFile.replace(/^\/+/, '')), sitemapStatic);
await writeFile(safeDistPath(distDir, sitemapIndexFile.replace(/^\/+/, '')), sitemapIndex);

const artifacts = await artifactManifest(distDir);
const version = {
  schemaVersion: 1,
  version: source.version,
  sourceFingerprint: source.fingerprint,
  designSha256: source.designSha256,
  artifactFingerprint: artifacts.fingerprint,
  routes: config.routes.map(route => route.path),
  assetMap: Object.fromEntries(assetMap),
  templatePath,
  initialAssets,
  inputs: source.inputs,
  artifacts: artifacts.files,
};
await writeFile(safeDistPath(distDir, 'version.json'), JSON.stringify(version, null, 2) + '\n');

console.log('pacote selado:', source.version, '| design:', source.designSha256.slice(0, 12), '| rotas:', config.routes.length);

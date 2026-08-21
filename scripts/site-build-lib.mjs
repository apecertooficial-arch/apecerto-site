import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

export const sha256 = value => createHash('sha256').update(value).digest('hex');

export async function readDeployConfig(root = process.cwd(), configPath = 'site.deploy.json') {
  const absolute = resolve(root, configPath);
  const config = JSON.parse(await readFile(absolute, 'utf8'));
  if (config.schemaVersion !== 1) throw new Error('site.deploy.json: schemaVersion deve ser 1');
  if (!Array.isArray(config.routes) || !config.routes.length) throw new Error('site.deploy.json: routes deve conter pelo menos uma rota');
  if (!Array.isArray(config.sourceInputs) || !config.sourceInputs.length) throw new Error('site.deploy.json: sourceInputs deve conter as fontes versionadas');
  return config;
}

async function walk(path) {
  const info = await stat(path);
  if (info.isFile()) return [path];
  if (!info.isDirectory()) return [];
  const names = await readdir(path);
  const nested = await Promise.all(names.sort().map(name => walk(resolve(path, name))));
  return nested.flat();
}

export async function collectInputFiles(root, inputs) {
  const rootAbs = resolve(root);
  const files = [];
  for (const input of inputs) {
    const absolute = resolve(rootAbs, input);
    if (absolute !== rootAbs && !absolute.startsWith(rootAbs + sep)) throw new Error('fonte fora do repositorio: ' + input);
    files.push(...await walk(absolute));
  }
  return [...new Set(files)].sort((a, b) => relative(rootAbs, a).localeCompare(relative(rootAbs, b)));
}

export async function sourceVersion(root, config) {
  const files = await collectInputFiles(root, config.sourceInputs);
  const entries = [];
  for (const file of files) {
    const bytes = await readFile(file);
    entries.push({
      path: relative(resolve(root), file).split(sep).join('/'),
      sha256: sha256(bytes),
      bytes: bytes.length,
    });
  }
  const fingerprint = sha256(entries.map(entry => entry.path + '\0' + entry.sha256 + '\0' + entry.bytes).join('\n'));
  const design = await readFile(resolve(root, config.designSource));
  return {
    fingerprint,
    version: fingerprint.slice(0, 16),
    designSha256: sha256(design),
    inputs: entries,
  };
}

export async function artifactManifest(distDir) {
  const dist = resolve(distDir);
  const files = await walk(dist);
  const entries = [];
  for (const file of files) {
    const path = relative(dist, file).split(sep).join('/');
    if (path === 'version.json') continue;
    const bytes = await readFile(file);
    entries.push({ path, sha256: sha256(bytes), bytes: bytes.length });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return {
    fingerprint: sha256(entries.map(entry => entry.path + '\0' + entry.sha256 + '\0' + entry.bytes).join('\n')),
    files: entries,
  };
}

export function safeDistPath(distDir, relativePath) {
  const dist = resolve(distDir);
  const absolute = resolve(dist, relativePath);
  if (absolute !== dist && !absolute.startsWith(dist + sep)) throw new Error('caminho fora de dist: ' + relativePath);
  return absolute;
}

export function routeOutputPath(routePath) {
  if (routePath === '/') return 'index.html';
  return routePath.replace(/^\/+|\/+$/g, '') + '/index.html';
}

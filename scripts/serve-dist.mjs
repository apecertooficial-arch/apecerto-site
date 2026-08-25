import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { readDeployConfig, safeDistPath } from './site-build-lib.mjs';

const root = process.cwd();
const distDir = resolve(root, process.env.APECERTO_DIST_DIR || 'dist');
const config = await readDeployConfig(root, process.env.APECERTO_DEPLOY_CONFIG || 'site.deploy.json');
const port = Number(process.env.APECERTO_PORT || 4173);
const mime = {
  '.avif': 'image/avif',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
};

const server = createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method || 'GET')) {
    response.writeHead(405, { allow: 'GET, HEAD' });
    response.end();
    return;
  }
  try {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    const dynamic = (config.dynamicRoutes || []).find(route =>
      route.pattern.endsWith('*')
        ? url.pathname.startsWith(route.pattern.slice(0, -1))
        : url.pathname === route.pattern,
    );
    let relative = dynamic ? dynamic.destination.replace(/^\/+/, '') : decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!dynamic && (!relative || url.pathname.endsWith('/'))) relative += 'index.html';
    const file = safeDistPath(distDir, relative);
    const body = await readFile(file);
    const contentType = mime[extname(file)] || 'application/octet-stream';
    const compressible = /^(?:text\/|font\/|application\/(?:javascript|json|xml))/.test(contentType);
    const gzip = compressible && body.length >= 1024 && /(?:^|,)\s*gzip\s*(?:,|$)/i.test(String(request.headers['accept-encoding'] || ''));
    const headers = {
      'content-type': contentType,
      // Espelha o Render: assets com hash são imutáveis; documentos sempre
      // revalidam. Assim os testes locais não baixam duas vezes um mesmo
      // preload e a navegação voltar/avançar continua elegível ao bfcache.
      'cache-control': relative.startsWith('assets/')
        ? 'public, max-age=31536000, immutable'
        : relative === 'version.json'
          ? 'no-store'
          : 'public, max-age=0, must-revalidate',
      ...(gzip ? { 'content-encoding': 'gzip', vary: 'Accept-Encoding' } : {}),
    };
    response.writeHead(200, headers);
    if (request.method === 'HEAD') response.end();
    else response.end(gzip ? gzipSync(body, { level: 9 }) : body);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log('site pronto em http://127.0.0.1:' + port);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}

import test from 'node:test';
import assert from 'node:assert';
import { readFile, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const existe = p => access(p).then(() => true, () => false);

test('catalogo publico consulta a view site_produtos', async () => {
  const d = await readFile('design/Site ApeCerto.dc.html', 'utf8');
  assert.ok(d.includes('/rest/v1/site_produtos'), 'o catalogo deve ler a view site_produtos');
});

test('build injeta o design no pacote-base', async t => {
  if (!(await existe('index.html'))) return t.skip('index.html (pacote-base) ainda nao esta no repo');
  execFileSync('node', ['scripts/build-site.mjs'], { stdio: 'inherit' });
  const out = await readFile('dist/index.html', 'utf8');
  assert.ok(out.startsWith('<!DOCTYPE html>'), 'dist/index.html deve ser um documento HTML');
  assert.ok(out.includes('__bundler/template'), 'bloco de template deve existir no dist');
  assert.ok(out.includes('site_produtos'), 'design injetado deve consultar site_produtos');
});

test('build aplica a camada de producao e tracking', async () => {
  execFileSync('node', ['scripts/build-site.mjs'], { stdio: 'inherit' });
  const out = await readFile('dist/index.html', 'utf8');
  const analytics = await readFile('dist/assets/analytics.js', 'utf8');
  assert.ok(analytics.includes('G-P63KVXKJDH'), 'o Analytics deve estar ligado ao site');
  assert.ok(out.includes('GTM-524TZP8X'), 'o Tag Manager deve estar ligado ao site');
  assert.ok(out.includes('/assets/analytics.js'), 'o runtime de tracking deve ser carregado');
  assert.ok(out.includes('11980154312'), 'o WhatsApp oficial deve estar no bundle');
  assert.ok(out.includes("apecertoTrack('generate_lead'"), 'leads devem disparar evento');
  assert.ok(out.includes('<html lang="pt-BR">'), 'o idioma deve estar definido');
  assert.ok(out.includes('<link rel="canonical" href="https://apecerto.com/">'), 'a canonical deve existir');
  assert.ok(!out.includes('CRECI-SP 00000-J'), 'o placeholder de CRECI nao pode ir para producao');
  assert.ok(!out.includes('CNPJ 00.000.000/0001-00'), 'o placeholder de CNPJ nao pode ir para producao');
});

test('build publica landings, privacidade e arquivos de busca', async () => {
  execFileSync('node', ['scripts/build-site.mjs'], { stdio: 'inherit' });
  for (const path of [
    'dist/avaliacao-imovel-moema/index.html',
    'dist/imoveis-moema/index.html',
    'dist/privacidade/index.html',
    'dist/robots.txt',
    'dist/sitemap.xml',
  ]) assert.ok(await existe(path), path + ' deve existir');
});

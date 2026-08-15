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

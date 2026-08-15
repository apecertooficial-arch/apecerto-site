import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const templateMatch = html.match(
  /<script type="__bundler\/template">\s*([\s\S]*?)\s*<\/script>/,
);

assert.ok(templateMatch, "o bundle precisa manter o template principal");
const template = JSON.parse(templateMatch[1]);

const loaderMatch = template.match(
  /  carregarProdutos\(\) \{[\s\S]*?\n  \}/,
);

assert.ok(loaderMatch, "o site precisa manter o carregador de produtos");
const loader = loaderMatch[0];

test("catálogo público vem da aprovação de Produtos do ERP", () => {
  assert.match(loader, /\/rest\/v1\/site_produtos\?select=\*/);
  assert.doesNotMatch(loader, /\/rest\/v1\/anuncios_site/);
  assert.match(loader, /produtos: rows/);
});

test("bundle continua estruturalmente íntegro", () => {
  assert.equal(
    (html.match(/<script type="__bundler\/template">/g) ?? []).length,
    1,
  );
  assert.match(template, /class Component extends DCLogic/);
  assert.match(template, /mapProduto\(r\)/);
});

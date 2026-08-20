import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
const design = fs.readFileSync(
  new URL("../design/Site ApeCerto.dc.html", import.meta.url),
  "utf8",
);
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

test("produto pronto só aparece como unidade aprovada e usa a galeria da unidade", () => {
  assert.match(design, /r && r\.status !== 'pronto'/);
  assert.match(design, /capa_path: u\.capa_path \|\| r\.capa_path/);
  assert.match(design, /Array\.isArray\(u\.fotos\) && u\.fotos\.length \? u\.fotos : r\.fotos/);
});

test("bundle continua estruturalmente íntegro", () => {
  assert.equal(
    (html.match(/<script type="__bundler\/template">/g) ?? []).length,
    1,
  );
  assert.match(template, /class Component extends DCLogic/);
  assert.match(template, /mapProduto\(r\)/);
  assert.match(template, /11980154312/);
  assert.match(template, /apecertoTrack\('generate_lead'/);
  assert.match(template, /apecertoSubmitSiteLead/);
  assert.match(template, /lead_type: 'financiamento'/);
  assert.doesNotMatch(template, /\/rest\/v1\/site_simulacoes/);
  assert.doesNotMatch(template, /name="cpf"/);
  assert.doesNotMatch(template, /name="rg"/);
  assert.notEqual(template, design, 'o build deve aplicar a camada de producao ao design de origem');
});

test("landing de proprietario registra o lead antes do WhatsApp", () => {
  const owner = fs.readFileSync(
    new URL("../static/avaliacao-imovel-moema/index.html", import.meta.url),
    "utf8",
  );
  assert.match(owner, /name="telefone"/);
  assert.match(owner, /apecertoSubmitSiteLead/);
  assert.match(owner, /lead_type: 'proprietario'/);
  assert.ok(owner.indexOf('await window.apecertoSubmitSiteLead') < owner.indexOf("apecertoTrack('generate_lead'"));
});

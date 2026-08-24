import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const html = fs.readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
const version = JSON.parse(fs.readFileSync(new URL("../dist/version.json", import.meta.url), "utf8"));
const design = fs.readFileSync(
  new URL("../design/Site ApeCerto.dc.html", import.meta.url),
  "utf8",
);
const analytics = fs.readFileSync(
  new URL("../dist/" + version.assetMap["/assets/analytics.js"].replace(/^\/+/, ""), import.meta.url),
  "utf8",
);
const templateMatch = html.match(
  /<script type="__bundler\/template">\s*([\s\S]*?)\s*<\/script>/,
);

assert.ok(templateMatch, "o bundle precisa manter o template principal");
const templatePayload = JSON.parse(templateMatch[1]);
const template = typeof templatePayload === "string"
  ? templatePayload
  : fs.readFileSync(new URL("../dist/" + version.templatePath.replace(/^\/+/, ""), import.meta.url), "utf8");

const loaderMatch = template.match(
  /  carregarProdutos\([^)]*\) \{[\s\S]*?\n  uuidValido\(/,
);

assert.ok(loaderMatch, "o site precisa manter o carregador de produtos");
const loader = loaderMatch[0];

test("catálogo público vem da aprovação de Produtos do ERP", () => {
  assert.match(template, /\/rest\/v1\/site_produtos\?/);
  assert.match(template, /params\.set\('select', '\*'\)/);
  assert.doesNotMatch(loader, /\/rest\/v1\/anuncios_site/);
  assert.match(loader, /this\.setState\(\{ produtos,/);
});

test("produto pronto só aparece como unidade aprovada e usa a galeria da unidade", () => {
  assert.match(design, /r && r\.status !== 'pronto'/);
  assert.match(design, /const capaUnidade = u\.capa_path \|\| fotosUnidade\[0\] \|\| null/);
  assert.match(design, /const fotosUnidade = Array\.isArray\(u\.fotos\) \? u\.fotos\.slice\(\) : \[\]/);
  assert.match(design, /const fotosCondominio = Array\.isArray\(r\.fotos\) \? r\.fotos\.slice\(\) : \[\]/);
  assert.match(design, /fotos_condominio: fotosCondominio/);
  assert.doesNotMatch(design, /fotosUnidade\[0\] \|\| r\.capa_path/);
  assert.doesNotMatch(design, /u\.fotos\.length \? u\.fotos\.slice\(\) : \(Array\.isArray\(r\.fotos\)/);
});

test("detalhe separa fotos privativas das áreas comuns do condomínio", () => {
  assert.match(design, /grupo: 'Fotos do imóvel'/);
  assert.match(design, /grupo: 'Áreas comuns do condomínio'/);
  assert.match(design, /galGrupoAtual/);
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
  assert.match(analytics, /apecertoSubmitSiteLead/);
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

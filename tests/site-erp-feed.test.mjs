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
const catalogoMigration = fs.readFileSync(
  new URL('../supabase/migrations/20260825142205_site_produtos_catalogo_leve.sql', import.meta.url),
  'utf8',
);
const catalogoMidiasIndex = fs.readFileSync(
  new URL('../supabase/migrations/20260825144014_midias_unidade_catalogo_idx.sql', import.meta.url),
  'utf8',
);

test("catálogo público vem da aprovação de Produtos do ERP", () => {
  assert.match(template, /\/rest\/v1\/site_produtos\?/);
  assert.match(template, /CATALOGO_VIEW = 'site_produtos_catalogo'/);
  assert.match(template, /catalogoLeveDisponivel = false/);
  assert.match(template, /urlDetalhesProdutos\(ids\)/);
  assert.match(template, /hidratarEmpreendimentos\(ids/);
  assert.doesNotMatch(loader, /\/rest\/v1\/anuncios_site/);
  assert.match(loader, /this\.setState\(\{ produtos,/);
});

test("catálogo leve preserva todas as unidades e busca galerias em lote só depois", () => {
  assert.match(design, /this\.expandirUnidades\(rows\)/);
  assert.match(design, /slice\(0, 6\)/);
  assert.match(design, /new Set\([^\n]*empreendimentoId/);
  assert.match(design, /detalhesCache\s*=\s*new Map\(\)/);
  assert.match(design, /detalhesEmVoo\s*=\s*new Map\(\)/);
  assert.match(design, /Promise\.all\(aguardando\.concat\(\[requisicao\]\)\)/);
  assert.match(design, /return new Promise\(resolve => \{[\s\S]{0,600}?resolve\(completos\)/, 'a hidratação deve aguardar a interface receber os detalhes antes de liberar o carrossel');
  assert.match(design, /faltantes\.includes\(detEmpId\)[\s\S]{0,160}?retornados\.has\(detEmpId\) \? null : detEmpId/, 'resposta vazia deve encerrar o carregamento com erro recuperável');
  assert.match(design, /mesclarDetalhesCache\(this\.expandirUnidades\(rows\)\)/);
  assert.match(design, /this\.filtrar\(\)\.out[^\n]*slice\(0, 6\)\.filter\(row => row && row\._catalogo_leve\)/, 'o fallback completo não pode baixar as mesmas galerias novamente');
  assert.match(design, /if \(!ids\.length\) return null/);
  assert.match(design, /galeriaPendente \? 1 : \(n \? \(idx \+ 1\) % n : 1\)/);
  assert.match(design, /det\.fotos && det\.fotos\.length \? det\.fotos : \(det && det\.capa_path \? \[det\.capa_path\] : \[\]\)/, 'a capa leve deve ocupar a galeria enquanto os detalhes chegam');
  assert.match(design, /galeriaDet\.slice\(galThumbInicio, galThumbInicio \+ 9\)/, 'o lightbox não deve requisitar dezenas de miniaturas de uma vez');
  assert.match(design, /\['fotos', 'fotos_condominio', 'descricao', 'diferenciais', 'lazer', 'tour_url'\]/, 'a hidratação só pode mesclar campos pesados, preservando preço e disponibilidade atuais');
  assert.match(design, /id:\s*'in\.\('/);
  assert.doesNotMatch(design, /for \([^)]*\)[\s\S]{0,120}fetch\(this\.urlDetalhesProdutos/);
  assert.match(catalogoMigration, /with \(security_invoker = true\)/);
  assert.match(catalogoMigration, /u\.publicado is true/);
  assert.match(catalogoMigration, /u\.disponivel is true/);
  assert.match(catalogoMigration, /u\.aprovacao is not distinct from 'aprovado'/);
  assert.doesNotMatch(catalogoMigration, /select\s+u\.\*/i, 'a view invoker não pode requisitar colunas privadas de unidades');
  assert.match(catalogoMigration, /e\.publicado is true/);
  assert.match(catalogoMigration, /e\.rascunho is false/);
  assert.match(catalogoMigration, /e\.aprovacao is not distinct from 'aprovado'/);
  assert.match(catalogoMigration, /revoke all privileges on public\.site_produtos_catalogo from public, anon, authenticated/);
  assert.match(catalogoMigration, /grant select on public\.site_produtos_catalogo to anon, authenticated/);
  assert.match(catalogoMidiasIndex, /on public\.midias \(unidade_id, tipo, is_capa desc, created_at\)/, 'a capa por unidade deve usar índice alinhado ao filtro e à ordenação');
  assert.match(catalogoMidiasIndex, /where unidade_id is not null/);
  const unidadesJson = catalogoMigration.match(/json_agg\(\s*json_build_object\(([\s\S]*?)\n\s*\)\s*order by u\.numero/);
  assert.ok(unidadesJson, 'o contrato das unidades deve continuar explícito');
  assert.doesNotMatch(unidadesJson[1], /'fotos'/, 'a galeria completa não pode voltar à listagem inicial');
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

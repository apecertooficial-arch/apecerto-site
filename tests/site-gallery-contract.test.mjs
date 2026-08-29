import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

function methodBody(source, name, nextName) {
  const match = source.match(new RegExp(`\\n  ${name}\\([^)]*\\) \\{([\\s\\S]*?)\\n  \\}\\n  ${nextName}\\(`));
  assert.ok(match, `método ${name} não encontrado`);
  return match[1];
}

test("resolver de fotos é idempotente somente para o proxy site-media allowlisted", async () => {
  const source = await readFile("design/Site ApeCerto.dc.html", "utf8");
  const fotoUrl = new Function("p", methodBody(source, "fotoUrl", "fotoAlt"));
  const context = {
    SB_URL: "https://project.example.invalid",
    uuidValido: value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  };
  const id = "11111111-1111-4111-8111-111111111111";
  const proxy = `${context.SB_URL}/functions/v1/site-media/${id}`;

  assert.equal(fotoUrl.call(context, `midia:${id}`), proxy);
  assert.equal(fotoUrl.call(context, proxy), proxy, "uma URL já resolvida não pode desaparecer na segunda passagem");
  assert.equal(fotoUrl.call(context, `${proxy}?token=nao-aceitar`), "", "query arbitrária não pertence ao contrato público");
  assert.equal(fotoUrl.call(context, `https://evil.example.invalid/functions/v1/site-media/${id}`), "");
  assert.equal(fotoUrl.call(context, `${context.SB_URL}/storage/v1/object/public/empreendimentos/path.jpg`), "");
  assert.equal(fotoUrl.call(context, "owner/path.jpg"), "");
});

test("fotoRender preserva o proxy allowlisted para os slots de background", async () => {
  const source = await readFile("design/Site ApeCerto.dc.html", "utf8");
  const fotoUrl = new Function("p", methodBody(source, "fotoUrl", "fotoAlt"));
  const fotoRender = new Function("p", "largura", "modo", methodBody(source, "fotoRender", "tourUrl"));
  const context = {
    SB_URL: "https://project.example.invalid",
    uuidValido: value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  };
  context.fotoUrl = value => fotoUrl.call(context, value);
  const proxy = `${context.SB_URL}/functions/v1/site-media/11111111-1111-4111-8111-111111111111`;

  assert.equal(fotoRender.call(context, proxy, 640, "cover"), proxy);
});

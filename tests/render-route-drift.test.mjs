import test from "node:test";
import assert from "node:assert/strict";
import { checkRenderRouteDrift, expectedLegacyHeader, expectedLegacyRule } from "../scripts/check-render-route-drift.mjs";

const destination = "https://project.test.invalid/functions/v1/site-seo/imovel/*";
const yaml = `services:
  - type: web
    routes:
      - type: rewrite
        source: /imovel/*
        destination: ${destination}
    headers:
      - path: /imovel/*
        name: Content-Type
        value: text/html; charset=utf-8
`;
const header = { path: "/imovel/*", name: "Content-Type", value: "text/html; charset=utf-8" };
const staticYaml = `services:
  - type: web
    runtime: static
    headers:
      - path: /imovel/*
        name: Content-Type
        value: text/html; charset=utf-8
`;

test("detector confirma ausência da regra externa no Static Site", () => {
  assert.equal(expectedLegacyRule(staticYaml), null);
  assert.deepEqual(expectedLegacyHeader(staticYaml), header);
  assert.deepEqual(checkRenderRouteDrift(staticYaml, [], [header]), { ok: true, drift: [] });
  assert.deepEqual(
    checkRenderRouteDrift(staticYaml, [{ action: "rewrite", source: "/imovel/*", destination }], [header]),
    { ok: false, drift: ["unexpected_active_rule"] },
  );
});

test("detector aceita a regra ativa idêntica à configuração versionada", () => {
  assert.deepEqual(expectedLegacyRule(yaml), { action: "rewrite", source: "/imovel/*", destination });
  assert.deepEqual(expectedLegacyHeader(yaml), header);
  assert.deepEqual(checkRenderRouteDrift(yaml, [{ action: "rewrite", source: "/imovel/*", destination }], [header]), { ok: true, drift: [] });
});

test("detector falha fechado quando ação, destino ou presença divergem", () => {
  assert.deepEqual(checkRenderRouteDrift(yaml, [], [header]), { ok: false, drift: ["missing_active_rule"] });
  assert.deepEqual(
    checkRenderRouteDrift(yaml, [{ action: "redirect", source: "/imovel/*", destination: "https://other.test.invalid/*" }], [header]),
    { ok: false, drift: ["action", "destination"] },
  );
});

test("detector rejeita regra duplicada para a mesma origem", () => {
  const active = [
    { action: "rewrite", source: "/imovel/*", destination },
    { action: "rewrite", source: "/imovel/*", destination },
  ];
  assert.deepEqual(checkRenderRouteDrift(yaml, active, [header]), { ok: false, drift: ["duplicate_source"] });
});

test("detector falha fechado quando o Content-Type ativo está ausente, duplicado ou divergente", () => {
  const rule = [{ action: "rewrite", source: "/imovel/*", destination }];
  assert.deepEqual(checkRenderRouteDrift(yaml, rule, []), { ok: false, drift: ["missing_active_header"] });
  assert.deepEqual(checkRenderRouteDrift(yaml, rule, [{ ...header, value: "text/plain" }]), { ok: false, drift: ["header_value"] });
  assert.deepEqual(checkRenderRouteDrift(yaml, rule, [header, header]), { ok: false, drift: ["duplicate_header"] });
});

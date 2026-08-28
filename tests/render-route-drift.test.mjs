import test from "node:test";
import assert from "node:assert/strict";
import { checkRenderRouteDrift, expectedLegacyRule } from "../scripts/check-render-route-drift.mjs";

const destination = "https://project.test.invalid/functions/v1/site-seo/imovel/*";
const yaml = `services:
  - type: web
    routes:
      - type: rewrite
        source: /imovel/*
        destination: ${destination}
`;

test("detector aceita a regra ativa idêntica à configuração versionada", () => {
  assert.deepEqual(expectedLegacyRule(yaml), { action: "rewrite", source: "/imovel/*", destination });
  assert.deepEqual(checkRenderRouteDrift(yaml, [{ action: "rewrite", source: "/imovel/*", destination }]), { ok: true, drift: [] });
});

test("detector falha fechado quando ação, destino ou presença divergem", () => {
  assert.deepEqual(checkRenderRouteDrift(yaml, []), { ok: false, drift: ["missing_active_rule"] });
  assert.deepEqual(
    checkRenderRouteDrift(yaml, [{ action: "redirect", source: "/imovel/*", destination: "https://other.test.invalid/*" }]),
    { ok: false, drift: ["action", "destination"] },
  );
});

test("detector rejeita regra duplicada para a mesma origem", () => {
  const active = [
    { action: "rewrite", source: "/imovel/*", destination },
    { action: "rewrite", source: "/imovel/*", destination },
  ];
  assert.deepEqual(checkRenderRouteDrift(yaml, active), { ok: false, drift: ["duplicate_source"] });
});

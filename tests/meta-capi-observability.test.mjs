import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260820182000_meta_capi_outbox_canonical.sql", import.meta.url), "utf8");
const crmCapi = await readFile(new URL("../supabase/functions/crm-capi/index.ts", import.meta.url), "utf8");
const metaCapi = await readFile(new URL("../supabase/functions/meta-capi/index.ts", import.meta.url), "utf8");

test("conversões offline usam fatos canônicos e outbox idempotente", () => {
  assert.match(migration, /private\.tracking_delivery_logs/);
  assert.match(migration, /unique index[\s\S]*channel, event_id/i);
  assert.match(migration, /trg_visita_meta_capi/);
  assert.match(migration, /trg_proposta_meta_capi/);
  assert.match(migration, /trg_venda_meta_capi/);
  assert.match(migration, /tracking_meta_retry/);
  assert.doesNotMatch(migration, /eyJhbGciOi/);
});

test("crm-capi versionada resolve visita, proposta e venda e registra recibo", () => {
  assert.match(crmCapi, /PropostaEnviada/);
  assert.match(crmCapi, /sourceTable === "visitas"/);
  assert.match(crmCapi, /sourceTable === "ncrm_proposta"/);
  assert.match(crmCapi, /sourceTable === "vendas"/);
  assert.match(crmCapi, /fbtrace_id/);
  assert.match(crmCapi, /capi_token_missing" }, 503/);
});

test("meta-capi do navegador também deixa trilha de entrega", () => {
  assert.match(metaCapi, /tracking_delivery_logs/);
  assert.match(metaCapi, /channel: "meta_browser"/);
  assert.match(metaCapi, /status: "delivered"/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../supabase/migrations/20260820182000_meta_capi_outbox_canonical.sql", import.meta.url), "utf8");
const funnelMigration = await readFile(new URL("../supabase/migrations/20260820200546_meta_capi_funil_qualidade.sql", import.meta.url), "utf8");
const identityMigration = await readFile(new URL("../supabase/migrations/20260820235900_meta_crm_lead_identity.sql", import.meta.url), "utf8");
const finalTriggersMigration = await readFile(new URL("../supabase/migrations/20260820235930_meta_crm_proposta_venda_triggers.sql", import.meta.url), "utf8");
const identityHardeningMigration = await readFile(new URL("../supabase/migrations/20260820235950_harden_meta_lead_identity_rpc.sql", import.meta.url), "utf8");
const crmCapi = await readFile(new URL("../supabase/functions/crm-capi/index.ts", import.meta.url), "utf8");
const metaCapi = await readFile(new URL("../supabase/functions/meta-capi/index.ts", import.meta.url), "utf8");
const historicalRepair = await readFile(new URL("../supabase/migrations/20260821235500_tracking_360_historical_repair.sql", import.meta.url), "utf8");

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
  assert.match(crmCapi, /LeadRespondeu/);
  assert.doesNotMatch(crmCapi, /LeadRespondido/);
  assert.match(crmCapi, /response_actor = "lead"/);
  assert.match(crmCapi, /message_direction = "inbound"/);
  assert.match(crmCapi, /QualificacaoIniciada/);
  assert.match(crmCapi, /qualified: "Qualificado"/);
  assert.doesNotMatch(crmCapi, /qualified: "LeadQualificado"/);
  assert.match(crmCapi, /visit_scheduled: "Schedule"/);
  assert.match(crmCapi, /PropostaEnviada/);
  assert.match(crmCapi, /sourceTable === "visitas"/);
  assert.match(crmCapi, /sourceTable === "ncrm_proposta"/);
  assert.match(crmCapi, /sourceTable === "vendas"/);
  assert.match(crmCapi, /fbtrace_id/);
  assert.match(crmCapi, /tracking_last_touch/);
  assert.match(crmCapi, /userData\.lead_id\s*=\s*String\(attribution\.meta_lead_id\)/);
  assert.match(crmCapi, /userData\.page_id\s*=\s*String\(attribution\.page_id\)/);
  assert.match(crmCapi, /lead_attribution/);
  assert.match(crmCapi, /event_time: Math\.max\(1, eventTime\)/);
  assert.match(crmCapi, /funnel_stage/);
  assert.match(crmCapi, /stage_rank/);
  assert.match(crmCapi, /action_source: "system_generated"/);
  assert.match(crmCapi, /event_source: "crm"/);
  assert.match(crmCapi, /userData\.lead_id = metaLeadId/);
  assert.match(crmCapi, /capi_token_missing" }, 503/);
});

test("identidade Meta e gatilhos finais de proposta/venda ficam protegidos", () => {
  assert.match(identityMigration, /meta_lead_id text/);
  assert.match(identityMigration, /tracking_set_meta_lead_id/);
  assert.match(identityMigration, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(identityMigration, /auth\.role\(\)/);
  assert.match(identityMigration, /revoke all[\s\S]*from public, anon, authenticated/);
  assert.match(finalTriggersMigration, /trg_proposta_meta_capi/);
  assert.match(finalTriggersMigration, /trg_venda_meta_capi/);
  assert.doesNotMatch(identityHardeningMigration, /auth\.role\(\)/);
  assert.match(identityHardeningMigration, /grant execute[\s\S]*to service_role/);
});

test("funil de qualidade usa fatos reais, sem chamar Em atendimento de qualificado", () => {
  assert.match(funnelMigration, /trg_lead_meta_capi/);
  assert.match(funnelMigration, /trg_wa_resposta_meta_capi/);
  assert.match(funnelMigration, /new\.direcao[\s\S]*\('out','saida','saída','enviada','sent'\)/);
  assert.match(funnelMigration, /visit_scheduled/);
  assert.match(funnelMigration, /qualification_started/);
  assert.match(funnelMigration, /v_event_id text := p_event_type \|\| '-' \|\| p_source_id/);
  assert.match(funnelMigration, /drop trigger if exists trg_negocio_meta_capi/);
  assert.doesNotMatch(funnelMigration, /stage_id\s*=\s*68/);
});

test("meta-capi do navegador também deixa trilha de entrega", () => {
  assert.match(metaCapi, /tracking_delivery_upsert/);
  assert.match(metaCapi, /tracking_delivery_update/);
  assert.match(metaCapi, /channel: "meta_browser"/);
  assert.match(metaCapi, /status: "delivered"/);
  assert.match(metaCapi, /body\?\.test_mode === true/);
});

test("reparo histórico usa contratos canônicos sem automação oculta", () => {
  assert.match(historicalRepair, /motor_atribuicao_meta_por_campos/);
  assert.match(historicalRepair, /enqueue_meta_crm_event/);
  assert.match(historicalRepair, /CONVERSANDO_QUALIFICANDO/);
  assert.doesNotMatch(historicalRepair, /create\s+(?:or\s+replace\s+)?trigger/i);
  assert.doesNotMatch(historicalRepair, /cron\.schedule/i);
});

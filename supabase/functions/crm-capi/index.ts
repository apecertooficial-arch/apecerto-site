import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  hashedBrazilPhone,
  hashedEmail,
  safeEventSourceUrl,
  sha256Hex,
} from "../_shared/meta-identity.ts";

const PIXEL_ID = Deno.env.get("META_PIXEL_ID") ?? "1088080836200357";
const TOKEN = Deno.env.get("META_CAPI_TOKEN") ?? "";
const TEST_CODE = Deno.env.get("META_TEST_EVENT_CODE") ?? "";
const GRAPH = "https://graph.facebook.com/v21.0";

const EVENT_MAP: Record<string, string> = {
  responded: "LeadRespondeu",
  qualification_started: "QualificacaoIniciada",
  visit_scheduled: "Schedule",
  // Keep this name aligned with the existing Meta custom conversion
  // "Lead Qualificado (CRM)". Meta does not allow editing that rule later.
  qualified: "Qualificado",
  visit: "VisitaRealizada",
  proposal: "PropostaEnviada",
  purchase: "Purchase",
};

const FUNNEL_STAGE: Record<string, { name: string; rank: number }> = {
  responded: { name: "lead_respondido", rank: 20 },
  qualification_started: { name: "qualificacao_iniciada", rank: 30 },
  qualified: { name: "lead_qualificado", rank: 35 },
  visit_scheduled: { name: "visita_agendada", rank: 40 },
  visit: { name: "visita_realizada", rank: 50 },
  proposal: { name: "proposta_enviada", rank: 60 },
  purchase: { name: "venda_concluida", rank: 70 },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function unixTime(value: unknown) {
  const milliseconds = new Date(String(value ?? "")).getTime();
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : Math.floor(Date.now() / 1000);
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "bad_json" }, 400);
  }

  const eventType = String(body.event_type ?? "");
  const metaEvent = EVENT_MAP[eventType];
  const sourceTable = String(body.source_table ?? "negocios");
  const sourceId = String(body.source_id ?? body.negocio_id ?? "");
  const deliveryId = String(body.delivery_id ?? "");
  const dryRun = body.dry_run === true;

  const updateDelivery = async (values: Record<string, unknown>) => {
    if (!deliveryId) return;
    await supabase.rpc("tracking_delivery_update", {
      p_id: deliveryId,
      p_status: values.status,
      p_response_status: values.response_status ?? null,
      p_fbtrace_id: values.fbtrace_id ?? null,
      p_error_code: values.error_code ?? null,
      p_last_error: values.last_error ?? null,
      p_next_attempt_at: values.next_attempt_at ?? null,
      p_delivered_at: values.delivered_at ?? null,
    });
  };

  if (!metaEvent || !sourceId) {
    await updateDelivery({ status: "failed", error_code: "invalid_input", last_error: "event_type/source_id inválido" });
    return json({ ok: false, error: "invalid_input" }, 400);
  }

  // A CAPI de CRM e exclusivamente interna. O UUID do outbox nao basta:
  // o servidor confirma tambem evento, tabela e fato canonico antes de enviar.
  // Assim um JWT publico nao consegue fabricar visita, proposta ou venda.
  if (!deliveryId) return json({ ok: false, error: "internal_delivery_required" }, 403);
  const { data: claimed, error: claimError } = await supabase.rpc("tracking_delivery_claim", {
    p_id: deliveryId,
    p_event_type: eventType,
    p_source_table: sourceTable,
    p_source_id: sourceId,
  });
  if (claimError || claimed !== true) {
    return json({ ok: false, error: "internal_delivery_invalid" }, 403);
  }

  let negocioId = body.negocio_id ? Number(body.negocio_id) : null;
  let purchaseValue: number | null = null;
  let proposalValue: number | null = null;
  let eventTime = unixTime(body.event_time ?? Date.now());

  if (sourceTable === "visitas") {
    const { data } = await supabase.from("visitas").select("negocio_id,resultado_em,atualizado_em,criado_em").eq("id", sourceId).maybeSingle();
    negocioId = negocioId ?? (Number(data?.negocio_id) || null);
    eventTime = unixTime(data?.resultado_em ?? data?.atualizado_em ?? data?.criado_em);
  } else if (sourceTable === "ncrm_proposta") {
    const { data } = await supabase.from("ncrm_proposta").select("negocio_id,valor,data_proposta,criada_em").eq("id", sourceId).maybeSingle();
    negocioId = negocioId ?? (Number(data?.negocio_id) || null);
    proposalValue = Number(data?.valor) || null;
    eventTime = unixTime(data?.data_proposta ?? data?.criada_em);
  } else if (sourceTable === "vendas") {
    const { data: venda } = await supabase.from("vendas").select("id,vgv,status,data_venda,data_conclusao,created_at").eq("id", sourceId).maybeSingle();
    purchaseValue = Number(venda?.vgv) || 0;
    eventTime = unixTime(venda?.data_conclusao ?? venda?.data_venda ?? venda?.created_at);
    if (!negocioId) {
      const { data: negocio } = await supabase.from("negocios").select("id").eq("venda_id", sourceId).limit(1).maybeSingle();
      negocioId = Number(negocio?.id) || null;
    }
    if (!negocioId) {
      const { data: proposta } = await supabase.from("ncrm_proposta").select("negocio_id").eq("venda_id", sourceId).limit(1).maybeSingle();
      negocioId = Number(proposta?.negocio_id) || null;
    }
  }

  if (!negocioId) {
    await updateDelivery({ status: "skipped", error_code: "negocio_not_found", last_error: "Fato canônico sem negócio relacionado" });
    return json({ ok: false, error: "negocio_nao_encontrado" }, 409);
  }

  const { data: negocio, error } = await supabase
    .from("negocios")
    .select("id,status,valor,raw,lead_id,leads(telefone,email)")
    .eq("id", negocioId)
    .maybeSingle();
  if (error || !negocio) {
    await updateDelivery({ status: "failed", error_code: "db_error", last_error: error?.message ?? "Negócio ausente" });
    return json({ ok: false, error: "db_error" }, 500);
  }

  const raw = (negocio.raw ?? {}) as Record<string, any>;
  const current = (raw.tracking_last_touch ?? raw.tracking?.attribution?.last ?? raw.tracking?.attribution?.current ?? {}) as Record<string, any>;
  const identity = (raw.tracking_identity ?? raw.tracking?.identity ?? {}) as Record<string, any>;
  const { data: attributionData } = await supabase.rpc("tracking_lead_attribution", { p_lead_id: negocio.lead_id });
  const attribution = (attributionData ?? {}) as Record<string, any>;
  const lead = (negocio as any).leads ?? {};
  const userData: Record<string, unknown> = { external_id: await sha256Hex(`negocio-${negocio.id}`) };
  const emailHash = await hashedEmail(lead.email);
  const phoneHash = await hashedBrazilPhone(lead.telefone);
  if (emailHash) userData.em = emailHash;
  if (phoneHash) userData.ph = phoneHash;
  if (attribution?.fbp ?? identity.fbp) userData.fbp = String(attribution?.fbp ?? identity.fbp);
  if (attribution?.fbc ?? identity.fbc) userData.fbc = String(attribution?.fbc ?? identity.fbc);
  // Para Lead Ads, a Meta oferece lead_id como identificador proprio de
  // correspondencia. Mantemos telefone/e-mail como sinais complementares,
  // mas o ID devolvido pelo formulario precisa viver em user_data (sem hash),
  // e nao somente como dimensao de relatorio em custom_data.
  if (attribution?.meta_lead_id) userData.lead_id = String(attribution.meta_lead_id);
  if (attribution?.page_id) userData.page_id = String(attribution.page_id);

  const customData: Record<string, unknown> = {
    lead_event_source: "crm_canonico",
    stage_event: eventType,
    funnel_stage: FUNNEL_STAGE[eventType]?.name,
    stage_rank: FUNNEL_STAGE[eventType]?.rank,
    campaign: attribution?.campaign ?? current.utm_campaign ?? undefined,
    campaign_id: attribution?.campaign_id ?? current.campaign_id ?? undefined,
    adset_id: attribution?.adset_id ?? current.adset_id ?? undefined,
    adset_name: attribution?.adset_name ?? current.adset ?? undefined,
    ad_id: attribution?.ad_id ?? current.ad_id ?? undefined,
    ad_name: attribution?.ad_name ?? current.ad ?? undefined,
    creative_id: attribution?.creative_id ?? current.creative_id ?? undefined,
    form_id: attribution?.form_id ?? current.form_id ?? undefined,
    page_id: attribution?.page_id ?? current.page_id ?? undefined,
    platform: attribution?.platform ?? current.platform ?? undefined,
    meta_lead_id: attribution?.meta_lead_id ?? undefined,
    source: attribution?.source ?? current.utm_source ?? undefined,
    medium: attribution?.medium ?? current.utm_medium ?? undefined,
  };
  if (eventType === "responded") {
    customData.response_actor = "lead";
    customData.message_direction = "inbound";
  }
  if (eventType === "purchase") {
    customData.value = purchaseValue ?? (Number(negocio.valor) || 0);
    customData.currency = "BRL";
  } else if (eventType === "proposal" && proposalValue !== null) {
    customData.value = proposalValue;
    customData.currency = "BRL";
  }

  const eventId = `${eventType}-${sourceId}`;
  const payload: Record<string, unknown> = {
    data: [{
      event_name: metaEvent,
      event_time: Math.max(1, eventTime),
      event_id: eventId,
      action_source: "website",
      event_source_url: safeEventSourceUrl(attribution?.landing_path ? `https://apecerto.com${String(attribution.landing_path)}` : "https://apecerto.com/"),
      user_data: userData,
      custom_data: customData,
    }],
  };
  if (TEST_CODE && body.test_mode === true) payload.test_event_code = TEST_CODE;

  if (dryRun) {
    return json({
      ok: true,
      dry_run: true,
      meta_event: metaEvent,
      event_id: eventId,
      user_data_signals: Object.keys(userData).sort(),
      custom_data_keys: Object.keys(customData).sort(),
      event_source_url: (payload.data as Array<Record<string, unknown>>)[0]?.event_source_url,
    });
  }
  if (!TOKEN) {
    await updateDelivery({ status: "blocked", error_code: "capi_token_missing", last_error: "META_CAPI_TOKEN ausente", next_attempt_at: new Date(Date.now() + 300_000).toISOString() });
    return json({ ok: false, error: "capi_token_missing" }, 503);
  }

  await updateDelivery({ status: "sending", error_code: null, last_error: null });
  const metaResponse = await fetch(`${GRAPH}/${PIXEL_ID}/events?access_token=${encodeURIComponent(TOKEN)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const output = await metaResponse.json().catch(() => ({}));
  if (!metaResponse.ok) {
    const detail = (output as any)?.error?.message ?? "Meta rejeitou o evento";
    await updateDelivery({ status: "failed", error_code: "meta_rejected", last_error: detail, response_status: metaResponse.status, next_attempt_at: new Date(Date.now() + 300_000).toISOString() });
    return json({ ok: false, error: "meta_rejected", detail }, 502);
  }

  await updateDelivery({ status: "delivered", response_status: metaResponse.status, fbtrace_id: (output as any)?.fbtrace_id ?? null, delivered_at: new Date().toISOString(), next_attempt_at: null });
  return json({ ok: true, meta_event: metaEvent, events_received: (output as any)?.events_received ?? null, fbtrace_id: (output as any)?.fbtrace_id ?? null, test_mode: Boolean(TEST_CODE && body.test_mode === true) }, 202);
});

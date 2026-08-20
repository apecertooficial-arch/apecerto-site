import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const PIXEL_ID = Deno.env.get("META_PIXEL_ID") ?? "1088080836200357";
const TOKEN = Deno.env.get("META_CAPI_TOKEN") ?? "";
const TEST_CODE = Deno.env.get("META_TEST_EVENT_CODE") ?? "";
const GRAPH = "https://graph.facebook.com/v21.0";

const EVENT_MAP: Record<string, string> = {
  qualified: "Qualificado",
  visit: "VisitaRealizada",
  proposal: "PropostaEnviada",
  purchase: "Purchase",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value.trim().toLowerCase()));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
    await supabase.schema("private").from("tracking_delivery_logs").update({ ...values, updated_at: new Date().toISOString() }).eq("id", deliveryId);
  };

  if (!metaEvent || !sourceId) {
    await updateDelivery({ status: "failed", error_code: "invalid_input", last_error: "event_type/source_id inválido" });
    return json({ ok: false, error: "invalid_input" }, 400);
  }

  let negocioId = body.negocio_id ? Number(body.negocio_id) : null;
  let purchaseValue: number | null = null;
  let proposalValue: number | null = null;

  if (sourceTable === "visitas" && !negocioId) {
    const { data } = await supabase.from("visitas").select("negocio_id").eq("id", sourceId).maybeSingle();
    negocioId = Number(data?.negocio_id) || null;
  } else if (sourceTable === "ncrm_proposta" && !negocioId) {
    const { data } = await supabase.from("ncrm_proposta").select("negocio_id,valor").eq("id", sourceId).maybeSingle();
    negocioId = Number(data?.negocio_id) || null;
    proposalValue = Number(data?.valor) || null;
  } else if (sourceTable === "vendas") {
    const { data: venda } = await supabase.from("vendas").select("id,vgv,status").eq("id", sourceId).maybeSingle();
    purchaseValue = Number(venda?.vgv) || 0;
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
  const tracking = (raw.tracking ?? {}) as Record<string, any>;
  const current = (tracking?.attribution?.current ?? {}) as Record<string, any>;
  const lead = (negocio as any).leads ?? {};
  const userData: Record<string, unknown> = { external_id: await sha256(`negocio-${negocio.id}`) };
  if (lead.email) userData.em = await sha256(String(lead.email));
  if (lead.telefone) userData.ph = await sha256(String(lead.telefone).replace(/\D/g, ""));
  if (current.fbclid) userData.fbc = `fb.1.${Date.now()}.${String(current.fbclid)}`;

  const customData: Record<string, unknown> = { lead_event_source: "crm_canonico", stage_event: eventType };
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
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: "website",
      event_source_url: tracking.landing_path ? `https://apecerto.com${String(tracking.landing_path)}` : "https://apecerto.com/",
      user_data: userData,
      custom_data: customData,
    }],
  };
  if (TEST_CODE) payload.test_event_code = TEST_CODE;

  if (dryRun) return json({ ok: true, dry_run: true, meta_event: metaEvent, payload });
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
  return json({ ok: true, meta_event: metaEvent, events_received: (output as any)?.events_received ?? null, fbtrace_id: (output as any)?.fbtrace_id ?? null }, 202);
});

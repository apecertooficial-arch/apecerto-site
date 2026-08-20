import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Meta Conversions API da ApeCerto. O navegador e o servidor usam o mesmo
// event_id, permitindo que a Meta deduplique Pixel e CAPI.
const ALLOWED_ORIGINS = new Set([
  "https://apecerto.com",
  "https://www.apecerto.com",
  "http://localhost:3000",
  "http://localhost:4173",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:5173",
]);

const PIXEL_ID = Deno.env.get("META_PIXEL_ID") ?? "1088080836200357";
const TOKEN = Deno.env.get("META_CAPI_TOKEN") ?? "";
const TEST_CODE = Deno.env.get("META_TEST_EVENT_CODE") ?? "";
const GRAPH = "https://graph.facebook.com/v21.0";

// Lead significa envio concluido. Intencao, abertura de portal e clique em CTA
// permanecem no tracking first-party/GA4, sem ensinar a Meta com falso positivo.
const EVENT_MAP: Record<string, string> = {
  page_view: "PageView",
  view_item: "ViewContent",
  property_search: "Search",
  sara_results: "Search",
  generate_lead: "Lead",
  whatsapp_click: "Contact",
  phone_click: "Contact",
  cta_click: "Schedule",
};

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://apecerto.com";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function response(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function clean(value: unknown, max: number) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (request.method !== "POST") return response(origin, { ok: false, error: "method_not_allowed" }, 405);
  if (origin && !ALLOWED_ORIGINS.has(origin)) return response(origin, { ok: false, error: "origin_not_allowed" }, 403);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 12_000) return response(origin, { ok: false, error: "payload_too_large" }, 413);

  try {
    const body = await request.json().catch(() => ({}));
    if (body?.consent_marketing !== true) {
      return response(origin, { ok: true, skipped: "no_consent" }, 202);
    }

    const internal = clean(body?.event_name, 60);
    const metaEvent = EVENT_MAP[internal];
    if (!metaEvent) return response(origin, { ok: false, error: "invalid_event" }, 400);

    const eventId = clean(body?.event_id, 64);
    if (!eventId) return response(origin, { ok: false, error: "missing_event_id" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const { data: delivery } = await supabase.schema("private").from("tracking_delivery_logs").upsert({
      channel: "meta_browser",
      event_id: eventId,
      event_type: internal,
      source_table: "site_events_anon",
      source_id: eventId,
      status: TOKEN ? "sending" : "blocked",
      attempt_count: 1,
      error_code: TOKEN ? null : "capi_token_missing",
      last_error: TOKEN ? null : "META_CAPI_TOKEN ausente",
      next_attempt_at: TOKEN ? null : new Date(Date.now() + 300_000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "channel,event_id" }).select("id").maybeSingle();
    const updateDelivery = async (values: Record<string, unknown>) => {
      if (!delivery?.id) return;
      await supabase.schema("private").from("tracking_delivery_logs").update({ ...values, updated_at: new Date().toISOString() }).eq("id", delivery.id);
    };
    if (!TOKEN) return response(origin, { ok: false, error: "capi_token_missing" }, 503);

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const userAgent = request.headers.get("user-agent") ?? "";
    const userData: Record<string, unknown> = {};
    if (ip) userData.client_ip_address = ip;
    if (userAgent) userData.client_user_agent = userAgent;
    if (body?.fbp) userData.fbp = clean(body.fbp, 120);
    if (body?.fbc) userData.fbc = clean(body.fbc, 200);
    if (body?.external_id) userData.external_id = await sha256(clean(body.external_id, 120));
    if (body?.email) userData.em = await sha256(clean(body.email, 160));
    if (body?.phone) userData.ph = await sha256(clean(String(body.phone).replace(/\D/g, ""), 40));

    const customData: Record<string, unknown> = {};
    const sourceData = body?.custom_data;
    if (sourceData && typeof sourceData === "object" && !Array.isArray(sourceData)) {
      for (const [key, value] of Object.entries(sourceData)) {
        if (typeof value === "string") customData[key] = clean(value, 100);
        else if (typeof value === "number" && Number.isFinite(value)) customData[key] = value;
        else if (typeof value === "boolean") customData[key] = value;
      }
    }

    const payload: Record<string, unknown> = {
      data: [{
        event_name: metaEvent,
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        event_source_url: clean(body?.event_source_url, 500) || "https://apecerto.com/",
        user_data: userData,
        custom_data: customData,
      }],
    };
    if (TEST_CODE) payload.test_event_code = TEST_CODE;

    const metaResponse = await fetch(`${GRAPH}/${PIXEL_ID}/events?access_token=${encodeURIComponent(TOKEN)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const output = await metaResponse.json().catch(() => ({}));
    if (!metaResponse.ok) {
      await updateDelivery({
        status: "failed",
        response_status: metaResponse.status,
        error_code: "meta_rejected",
        last_error: output?.error?.message ?? "Meta rejeitou o evento",
        next_attempt_at: new Date(Date.now() + 300_000).toISOString(),
      });
      return response(origin, { ok: false, error: "meta_rejected", detail: output?.error?.message ?? null }, 502);
    }
    await updateDelivery({
      status: "delivered",
      response_status: metaResponse.status,
      fbtrace_id: output?.fbtrace_id ?? null,
      delivered_at: new Date().toISOString(),
      next_attempt_at: null,
    });
    return response(origin, {
      ok: true,
      events_received: output?.events_received ?? null,
      fbtrace_id: output?.fbtrace_id ?? null,
    }, 202);
  } catch {
    return response(origin, { ok: false, error: "unexpected_error" }, 500);
  }
});

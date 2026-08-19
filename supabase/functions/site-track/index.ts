import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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

const ALLOWED_EVENTS = new Set([
  "page_view", "consent_update", "view_item", "view_inventory",
  "generate_lead", "whatsapp_click", "phone_click", "social_click",
  "sara_open", "sara_search", "sara_results", "sara_error",
  "favorite_toggle", "gallery_interaction", "property_search",
  "cta_click", "owner_cta_click", "owner_portal_open", "form_start",
  "filter_change", "scroll_depth",
]);

const ALLOWED_PROPERTY_KEYS = new Set([
  "action_label", "bairro", "consent_choice", "cta_name", "currency",
  "error_type", "filter_type", "finalidade", "form_context",
  "has_bedroom_filter", "has_price_filter", "item_id", "item_name",
  "lead_type", "objetivo", "percent_scrolled", "query_length",
  "result_count", "social_network", "source", "status", "value",
]);

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

function cleanText(value: unknown, maxLength: number) {
  const raw = String(value ?? "");
  let out = "";
  for (const ch of raw) {
    const code = ch.codePointAt(0)!;
    out += (code < 32 || code === 127) ? " " : ch;
  }
  return out.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanPath(value: unknown) {
  const raw = cleanText(value, 500);
  try {
    const parsed = new URL(raw, "https://apecerto.com");
    return parsed.pathname.slice(0, 240) || "/";
  } catch {
    return "/";
  }
}

function cleanProperties(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string | number | boolean> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!ALLOWED_PROPERTY_KEYS.has(key)) continue;
    if (typeof item === "boolean") out[key] = item;
    else if (typeof item === "number" && Number.isFinite(item)) out[key] = item;
    else if (typeof item === "string") out[key] = cleanText(item, 100);
  }
  return out;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
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
    const eventName = cleanText(body?.event_name, 60);
    const pageViewId = cleanText(body?.page_view_id, 36);
    if (!ALLOWED_EVENTS.has(eventName) || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(pageViewId)) {
      return response(origin, { ok: false, error: "invalid_event" }, 400);
    }

    const consentLevel = ["essential", "analytics", "marketing"].includes(body?.consent_level)
      ? body.consent_level
      : "essential";
    const sessionIdRaw = cleanText(body?.session_id, 36);
    const sessionId = consentLevel !== "essential" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(sessionIdRaw)
      ? sessionIdRaw
      : null;
    const deviceCategory = ["mobile", "tablet", "desktop", "unknown"].includes(body?.device_category)
      ? body.device_category
      : "unknown";

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "no-ip";
    const userAgent = request.headers.get("user-agent") ?? "no-ua";
    const clientHash = await sha256(`${ip}|${userAgent}|site-telemetry-v1`);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: accepted, error } = await supabase.rpc("site_event_ingest_v2", {
      p_client_hash: clientHash,
      p_page_view_id: pageViewId,
      p_session_id: sessionId,
      p_event_name: eventName,
      p_page_path: cleanPath(body?.page_path),
      p_referrer_host: cleanText(body?.referrer_host, 160) || null,
      p_device_category: deviceCategory,
      p_consent_level: consentLevel,
      p_utm_source: cleanText(body?.utm_source, 120) || null,
      p_utm_medium: cleanText(body?.utm_medium, 120) || null,
      p_utm_campaign: cleanText(body?.utm_campaign, 160) || null,
      p_properties: cleanProperties(body?.properties),
      p_limit: 300,
    });

    if (error) return response(origin, { ok: false, error: "ingest_unavailable" }, 503);
    if (!accepted) return response(origin, { ok: false, error: "not_accepted" }, 429);
    return response(origin, { ok: true }, 202);
  } catch {
    return response(origin, { ok: false, error: "unexpected_error" }, 500);
  }
});

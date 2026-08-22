// JavaScript válido de propósito: o mesmo handler roda nos testes locais e no
// runtime Deno da Supabase, sem expor a chave de serviço no navegador.

const ALLOWED_ORIGINS = new Set([
  "https://apecerto.com",
  "https://www.apecerto.com",
]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const BODY_KEYS = new Set([
  "request_id", "event_id", "nome", "telefone", "email", "renda_mensal",
  "percentual_financiado", "empreendimento_id", "unidade_id",
  "page_view_id", "tracking", "page_url", "item_id", "item_codigo",
  "item_name",
]);
const TOUCH_KEYS = new Set([
  "gclid", "gbraid", "wbraid", "fbclid",
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "campaign_id", "adset_id", "ad_group_id", "ad_id", "creative_id",
  "placement", "landing_path", "captured_at", "referrer_host",
]);

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Headers": "content-type, x-idempotency-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function jsonResponse(origin, body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

function cleanText(value, maxLength) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function uuid(value) {
  const normalized = cleanText(value, 36).toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function normalizePhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return /^55[1-9][0-9]{9,10}$/.test(digits) ? digits : null;
}

function normalizeEmail(value) {
  const email = cleanText(value, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function finiteNumber(value, minimum, maximum) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function safePageUrl(value) {
  try {
    const parsed = new URL(String(value ?? ""));
    if (!ALLOWED_ORIGINS.has(parsed.origin)) return null;
    if (/[/\\][.]{2}(?:[/\\]|$)/.test(parsed.pathname)) return null;
    return `https://apecerto.com${parsed.pathname || "/"}`.slice(0, 500);
  } catch {
    return null;
  }
}

function safePath(value) {
  try {
    const parsed = new URL(String(value ?? "/"), "https://apecerto.com");
    return (parsed.pathname || "/").slice(0, 240);
  } catch {
    return "/";
  }
}

function safeHost(value) {
  const host = cleanText(value, 160).toLowerCase();
  return /^[a-z0-9.-]+(?::[0-9]{1,5})?$/.test(host) ? host : null;
}

function cleanTouch(value, marketingAllowed) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (!TOUCH_KEYS.has(key)) continue;
    if (!marketingAllowed && ["gclid", "gbraid", "wbraid", "fbclid"].includes(key)) continue;
    if (key === "landing_path") out[key] = safePath(item);
    else if (key === "referrer_host") {
      const host = safeHost(item);
      if (host) out[key] = host;
    } else if (key === "captured_at") {
      const date = new Date(String(item ?? ""));
      if (Number.isFinite(date.valueOf())) out[key] = date.toISOString();
    } else {
      const text = cleanText(item, 200);
      if (text) out[key] = text;
    }
  }
  return out;
}

function cleanTracking(value, pageViewId) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const consentRaw = raw.consent && typeof raw.consent === "object" ? raw.consent : {};
  const consent = {
    analytics: consentRaw.analytics === true,
    marketing: consentRaw.marketing === true,
  };
  const identityRaw = raw.identity && typeof raw.identity === "object" ? raw.identity : {};
  const sessionId = consent.analytics || consent.marketing ? uuid(raw.session_id ?? identityRaw.session_id) : null;
  const identity = { page_view_id: pageViewId, session_id: sessionId };
  if (consent.analytics) {
    const gaClientId = cleanText(identityRaw.ga_client_id, 120);
    const gaSessionId = cleanText(identityRaw.ga_session_id, 120);
    if (gaClientId) identity.ga_client_id = gaClientId;
    if (gaSessionId) identity.ga_session_id = gaSessionId;
  }
  if (consent.marketing) {
    const fbp = cleanText(identityRaw.fbp, 500);
    const fbc = cleanText(identityRaw.fbc, 500);
    if (fbp) identity.fbp = fbp;
    if (fbc) identity.fbc = fbc;
  }
  const attributionRaw = raw.attribution && typeof raw.attribution === "object" ? raw.attribution : {};
  return {
    version: 2,
    page_view_id: pageViewId,
    session_id: sessionId,
    landing_path: safePath(raw.landing_path),
    current_path: safePath(raw.current_path),
    referrer_host: safeHost(raw.referrer_host),
    consent,
    identity,
    attribution: {
      first: cleanTouch(attributionRaw.first, consent.marketing),
      last: cleanTouch(attributionRaw.last, consent.marketing),
      current: cleanTouch(attributionRaw.current, consent.marketing),
    },
  };
}

function normalizedIp(value) {
  const candidate = cleanText(value, 64).replace(/^\[|\]$/g, "");
  if (/^[0-9]{1,3}(?:\.[0-9]{1,3}){3}$/.test(candidate)) {
    const parts = candidate.split(".").map(Number);
    return parts.every((part) => part >= 0 && part <= 255) ? parts.join(".") : null;
  }
  return candidate.includes(":") && /^[0-9a-f:.]+$/i.test(candidate) ? candidate.toLowerCase() : null;
}

// Na plataforma hospedada, Cloudflare/gateway preenchem estes headers. Nunca
// aceitamos um IP enviado no JSON e nunca persistimos o valor bruto.
function trustedClientIp(request) {
  const cloudflare = normalizedIp(request.headers.get("cf-connecting-ip"));
  if (cloudflare) return cloudflare;
  const real = normalizedIp(request.headers.get("x-real-ip"));
  if (real) return real;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return normalizedIp(forwarded);
}

async function hmacHex(secret, value) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function serviceRoleKey(env) {
  const key = cleanText(env.get("SUPABASE_SERVICE_ROLE_KEY"), 4096);
  if (!key) throw new Error("service_key_missing");
  if (key.startsWith("sb_secret_")) return key;
  const parts = key.split(".");
  if (parts.length !== 3) throw new Error("service_key_invalid");
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(payload + "=".repeat((4 - payload.length % 4) % 4)));
    if (decoded.role !== "service_role") throw new Error("wrong_role");
  } catch {
    throw new Error("service_key_invalid");
  }
  return key;
}

export function createSiteFinancingLeadHandler({ fetchImpl = fetch, env = globalThis.Deno?.env }) {
  return async function siteFinancingLead(request) {
    const origin = request.headers.get("origin");
    if (request.method === "OPTIONS") {
      if (!origin || !ALLOWED_ORIGINS.has(origin)) {
        return jsonResponse(origin, { ok: false, error: "origin_not_allowed" }, 403);
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "POST") {
      return jsonResponse(origin, { ok: false, error: "method_not_allowed" }, 405, { Allow: "POST, OPTIONS" });
    }
    if (!origin || !ALLOWED_ORIGINS.has(origin)) {
      return jsonResponse(origin, { ok: false, error: "origin_not_allowed" }, 403);
    }
    if (!String(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
      return jsonResponse(origin, { ok: false, error: "invalid_request" }, 400);
    }
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > 20_000) return jsonResponse(origin, { ok: false, error: "invalid_request" }, 400);

    try {
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > 20_000) {
        return jsonResponse(origin, { ok: false, error: "invalid_request" }, 400);
      }
      let body;
      try {
        body = JSON.parse(rawBody);
      } catch {
        return jsonResponse(origin, { ok: false, error: "invalid_request" }, 400);
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return jsonResponse(origin, { ok: false, error: "invalid_request" }, 400);
      }
      if (Object.keys(body).some((key) => !BODY_KEYS.has(key))) {
        return jsonResponse(origin, { ok: false, error: "invalid_request" }, 400);
      }

      const requestId = uuid(body.request_id);
      const eventId = uuid(body.event_id);
      const headerId = uuid(request.headers.get("x-idempotency-key"));
      const pageViewId = uuid(body.page_view_id);
      const empreendimentoId = uuid(body.empreendimento_id);
      const unidadeId = body.unidade_id == null || body.unidade_id === "" ? null : uuid(body.unidade_id);
      const name = cleanText(body.nome, 120);
      const phone = normalizePhone(body.telefone);
      const email = normalizeEmail(body.email);
      const income = finiteNumber(body.renda_mensal, 500, 10_000_000);
      const percentage = finiteNumber(body.percentual_financiado, 20, 90);
      const pageUrl = safePageUrl(body.page_url);
      const ip = trustedClientIp(request);
      if (
        !requestId || eventId !== requestId || headerId !== requestId ||
        !pageViewId || !empreendimentoId ||
        (body.unidade_id != null && body.unidade_id !== "" && !unidadeId) ||
        name.length < 2 || !phone || !email || income == null ||
        !Number.isInteger(percentage) || percentage % 5 !== 0 || !pageUrl || !ip
      ) {
        return jsonResponse(origin, { ok: false, error: "invalid_request" }, 400);
      }

      const tracking = cleanTracking(body.tracking, pageViewId);
      const supabaseUrl = String(env?.get?.("SUPABASE_URL") ?? "").replace(/\/+$/, "");
      if (!/^https:\/\/[a-z0-9-]+[.]supabase[.]co$/i.test(supabaseUrl)) throw new Error("supabase_url_invalid");
      const serviceKey = serviceRoleKey(env);
      const userAgent = cleanText(request.headers.get("user-agent"), 300) || "unknown";
      const target = unidadeId || empreendimentoId;
      const [ipHash, clientHash, payloadHash, dedupeHash] = await Promise.all([
        hmacHex(serviceKey, `site-financing:ip:${ip}`),
        hmacHex(serviceKey, `site-financing:client:${pageViewId}|${userAgent}`),
        // Tracking consentido pode terminar de preencher IDs do GA entre duas
        // tentativas. A idempotência compara somente os dados comerciais estáveis.
        hmacHex(serviceKey, `site-financing:payload:${JSON.stringify({ requestId, name, phone, email, income, percentage, empreendimentoId, unidadeId, pageUrl })}`),
        hmacHex(serviceKey, `site-financing:dedupe:${phone}|${email}|${target}|${income}|${percentage}`),
      ]);
      if (![ipHash, clientHash, payloadHash, dedupeHash].every((hash) => HASH_PATTERN.test(hash))) {
        throw new Error("hash_failed");
      }

      const serviceHeaders = {
        apikey: serviceKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      // Secret keys modernas autenticam pelo apikey. Somente o JWT legado de
      // service_role é também um Bearer token válido.
      if (!serviceKey.startsWith("sb_secret_")) serviceHeaders.Authorization = `Bearer ${serviceKey}`;
      const rpcResponse = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/site_financing_lead_ingest`, {
        method: "POST",
        headers: serviceHeaders,
        body: JSON.stringify({
          p_request_id: requestId,
          p_payload_hash: payloadHash,
          p_dedupe_hash: dedupeHash,
          p_ip_hash: ipHash,
          p_client_hash: clientHash,
          p_nome: name,
          p_telefone: phone,
          p_email: email,
          p_empreendimento_id: empreendimentoId,
          p_unidade_id: unidadeId,
          p_renda_mensal: income,
          p_percentual_financiado: percentage,
          p_page_view_id: pageViewId,
          p_tracking: tracking,
          p_page_url: pageUrl,
        }),
        redirect: "error",
        signal: AbortSignal.timeout(8_000),
      });
      if (!rpcResponse.ok) throw new Error("rpc_unavailable");
      const result = await rpcResponse.json().catch(() => null);
      if (!result || typeof result !== "object") throw new Error("rpc_invalid");
      if (result.accepted !== true) {
        if (result.code === "rate_limited") {
          return jsonResponse(origin, { ok: false, error: "rate_limited" }, 429, { "Retry-After": "900" });
        }
        if (result.code === "idempotency_conflict") {
          return jsonResponse(origin, { ok: false, error: "idempotency_conflict" }, 409);
        }
        if (result.code === "invalid_request" || result.code === "target_not_available") {
          return jsonResponse(origin, { ok: false, error: "invalid_request" }, 400);
        }
        throw new Error("ingest_rejected");
      }

      const conversionEventId = uuid(result.conversion_event_id) || requestId;
      return jsonResponse(origin, {
        ok: true,
        accepted: true,
        duplicate: result.duplicate === true,
        request_id: requestId,
        conversion_event_id: conversionEventId,
      }, 202);
    } catch {
      return jsonResponse(origin, { ok: false, error: "temporarily_unavailable" }, 503);
    }
  };
}

if (typeof Deno !== "undefined" && Deno?.serve) {
  Deno.serve(createSiteFinancingLeadHandler({ fetchImpl: fetch, env: Deno.env }));
}

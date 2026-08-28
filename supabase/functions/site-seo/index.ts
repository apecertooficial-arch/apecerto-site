// Esta Edge Function e intencionalmente escrita como JavaScript valido para que
// o mesmo handler possa ser exercitado pelos testes locais sem simular o Deno.
// A consulta usa somente a chave publica e a view RLS `site_produtos`.

export const SITE_ORIGIN = "https://apecerto.com";
export const SHELL_URL = `${SITE_ORIGIN}/`;

export const FIXED_ROUTES = Object.freeze([
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/imoveis-moema/", changefreq: "daily", priority: "0.9" },
  { path: "/avaliacao-imovel-moema/", changefreq: "weekly", priority: "0.9" },
  { path: "/privacidade/", changefreq: "yearly", priority: "0.3" },
  { path: "/proprietario/", changefreq: "monthly", priority: "0.5" },
  { path: "/proprietario/cadastre-seu-imovel/", changefreq: "weekly", priority: "0.9" },
]);

const CATALOG_SELECT = [
  "id", "nome", "titulo", "slug", "slogan", "bairro", "endereco", "cidade", "uf",
  "status", "finalidade", "descricao", "seo_titulo", "seo_descricao", "area_util", "dormitorios", "vagas", "preco",
  "preco_min", "preco_max", "capa_path", "fotos", "fotos_meta", "unidades_site", "ordem",
].join(",");
const PAGE_SIZE = 500;
const MAX_CATALOG_ROWS = 10_000;
const MAX_SITEMAP_URLS = 49_000;
const MAX_SHELL_BYTES = 2_000_000;
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,178}[a-z0-9])?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SUCCESS_CACHE = "public, max-age=60, s-maxage=300, stale-while-revalidate=86400";
const NOT_FOUND_CACHE = "public, max-age=30, s-maxage=60, stale-while-revalidate=300";

function cleanText(value, maxLength = 240) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, maxLength).trim();
}

function publicStreet(value) {
  return cleanText(value, 160).split(",", 1)[0]
    .replace(/(?:\d|\s+(?:ap(?:to|artamento)?\.?|unidade|bloco|torre|lote|complemento|fundos|casa|sala|andar|conjunto|cj\.?|s\/?n|sem n(?:ú|u)mero)\b).*$/i, "")
    .replace(/[\s,;-]+$/g, "")
    .trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function safeJson(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function compactObject(value) {
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === null || item === "") continue;
    if (Array.isArray(item) && item.length === 0) continue;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const nested = compactObject(item);
      if (Object.keys(nested).length) out[key] = nested;
      continue;
    }
    out[key] = item;
  }
  return out;
}

function finiteNumber(value, minimum = 0, maximum = 1_000_000_000) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180)
    .replace(/-+$/g, "");
}

function entitySlug(entity) {
  const explicit = slugify(entity?.slug);
  if (SLUG_PATTERN.test(explicit)) return explicit;
  const id = String(entity?.id ?? "").toLowerCase();
  return UUID_PATTERN.test(id) ? id : "";
}

function decodeRequestedSlug(pathValue) {
  let decoded;
  try { decoded = decodeURIComponent(pathValue); } catch { return ""; }
  if (decoded.length > 180 || decoded.includes("/") || /[\u0000-\u001f\u007f]/.test(decoded)) return "";
  const normalized = slugify(decoded);
  return normalized === decoded.toLowerCase() && SLUG_PATTERN.test(normalized) ? normalized : "";
}

function publicKey(env) {
  const value = [
    env.get("SUPABASE_PUBLISHABLE_KEY"),
    env.get("SB_PUBLISHABLE_KEY"),
    env.get("SUPABASE_ANON_KEY"),
  ].find((item) => typeof item === "string" && item.trim())?.trim() ?? "";
  if (!value || value.startsWith("sb_secret_")) throw new Error("public_catalog_key_unavailable");
  if (value.startsWith("sb_publishable_")) return value;
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("public_catalog_key_invalid");
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - payload.length % 4) % 4);
    if (JSON.parse(atob(padded)).role !== "anon") throw new Error("not_anon");
  } catch {
    throw new Error("public_catalog_key_invalid");
  }
  return value;
}

function serviceRoleKey(env) {
  const value = String(env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!value) throw new Error("legacy_resolver_key_unavailable");
  if (value.startsWith("sb_secret_")) return value;
  const parts = value.split(".");
  if (parts.length !== 3) throw new Error("legacy_resolver_key_invalid");
  try {
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - payload.length % 4) % 4);
    if (JSON.parse(atob(padded)).role !== "service_role") throw new Error("not_service_role");
  } catch {
    throw new Error("legacy_resolver_key_invalid");
  }
  return value;
}

async function fetchLegacyResolution({ fetchImpl, env, supabaseUrl, slug }) {
  const key = serviceRoleKey(env);
  const response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/site_produto_resolver_slug_legado`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_slug: slug }),
    redirect: "error",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error(`legacy_resolver_unavailable_${response.status}`);
  const rows = await response.json().catch(() => null);
  const resolved = Array.isArray(rows) && rows.length === 1 ? slugify(rows[0]?.slug) : "";
  return SLUG_PATTERN.test(resolved) ? resolved : "";
}

function storageImage(value, supabaseUrl) {
  const raw = String(value ?? "").trim();
  if (!raw || /[\u0000-\u001f\u007f"'\\()]/.test(raw)) return "";
  if (raw.startsWith("midia:")) {
    const id = raw.slice(6);
    return UUID_PATTERN.test(id) ? `${supabaseUrl}/functions/v1/site-media/${id.toLowerCase()}` : "";
  }
  return "";
}

function unitsOf(row) {
  return Array.isArray(row?.unidades_site) ? row.unidades_site.filter((unit) => unit && typeof unit === "object") : [];
}

export async function fetchCatalog({ fetchImpl, env, pageSize = PAGE_SIZE }) {
  const supabaseUrl = String(env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl)) throw new Error("supabase_url_invalid");
  const key = publicKey(env);
  const rows = [];
  for (let start = 0; start < MAX_CATALOG_ROWS; start += pageSize) {
    const endpoint = new URL(`${supabaseUrl}/rest/v1/site_produtos`);
    endpoint.searchParams.set("select", CATALOG_SELECT);
    endpoint.searchParams.set("order", "ordem.asc.nullslast,nome.asc,id.asc");
    const end = start + pageSize - 1;
    const response = await fetchImpl(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        apikey: key,
        Range: `${start}-${end}`,
        "Range-Unit": "items",
      },
      redirect: "error",
      signal: AbortSignal.timeout(7_000),
    });
    if (!response.ok) throw new Error(`catalog_unavailable_${response.status}`);
    const page = await response.json().catch(() => null);
    if (!Array.isArray(page)) throw new Error("catalog_invalid");
    rows.push(...page);
    if (rows.length > MAX_CATALOG_ROWS) throw new Error("catalog_too_large");
    const contentRange = response.headers.get("content-range") ?? "";
    const total = Number(contentRange.split("/")[1]);
    if (page.length < pageSize || (Number.isFinite(total) && rows.length >= total)) return { rows, supabaseUrl };
  }
  throw new Error("catalog_too_large");
}

export function catalogEntities(rows) {
  const entities = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const rowSlug = entitySlug(row);
    if (rowSlug) entities.push({ kind: "property", slug: rowSlug, row, unit: null });
    for (const unit of unitsOf(row)) {
      const unitSlug = entitySlug(unit);
      if (unitSlug) entities.push({ kind: "unit", slug: unitSlug, row, unit });
    }
  }
  return entities;
}

function canonicalForSlug(slug) {
  return `${SITE_ORIGIN}/imovel/${encodeURIComponent(slug)}/`;
}

export function buildSitemap(rows) {
  const urls = FIXED_ROUTES.map((route) => ({
    loc: new URL(route.path, SITE_ORIGIN).href,
    changefreq: route.changefreq,
    priority: route.priority,
  }));
  const seen = new Set(urls.map((entry) => entry.loc));
  for (const entity of catalogEntities(rows)) {
    const loc = canonicalForSlug(entity.slug);
    if (seen.has(loc)) continue;
    seen.add(loc);
    urls.push({ loc, changefreq: "daily", priority: entity.kind === "unit" ? "0.8" : "0.9" });
  }
  if (urls.length > MAX_SITEMAP_URLS) throw new Error("sitemap_too_large");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((entry) => [
      "  <url>",
      `    <loc>${escapeXml(entry.loc)}</loc>`,
      `    <changefreq>${entry.changefreq}</changefreq>`,
      `    <priority>${entry.priority}</priority>`,
      "  </url>",
    ].join("\n")),
    "</urlset>",
    "",
  ].join("\n");
}

function unitBedrooms(unit, row) {
  const typology = cleanText(unit?.tipologia, 80).toLowerCase();
  if (typology.includes("studio")) return 0;
  const match = typology.match(/^(\d+)/);
  return match ? Number(match[1]) : finiteNumber(row?.dormitorios, 0, 30);
}

function neutralPropertyName(entity) {
  const row = entity.row;
  const unit = entity.unit;
  const typology = cleanText(unit?.tipologia, 80).toLowerCase();
  const type = typology.includes("studio") ? "Studio"
    : typology.includes("cobertura") ? "Cobertura"
      : typology.includes("casa") ? "Casa"
        : typology.includes("terreno") ? "Terreno"
          : typology.includes("comercial") || typology.includes("sala") ? "Imóvel comercial"
            : "Apartamento";
  const bedrooms = unitBedrooms(unit, row);
  const rooms = bedrooms === 1 ? " com 1 quarto" : bedrooms > 1 ? ` com ${bedrooms} quartos` : "";
  const bairro = cleanText(row?.bairro, 80);
  const cidade = cleanText(row?.cidade, 80);
  const place = bairro ? ` em ${bairro}${cidade ? `, ${cidade}` : ""}` : cidade ? ` em ${cidade}` : "";
  return cleanText(`${type}${rooms}${place}`, 100);
}

function propertyName(entity) {
  return neutralPropertyName(entity) || "Imóvel disponível";
}

function descriptionFor(entity) {
  const row = entity.row;
  const unit = entity.unit;
  const details = [
    propertyName(entity),
    cleanText(unit?.tipologia, 60),
    finiteNumber(unit?.area_m2 ?? row?.area_util, 1, 10_000) ? `${Math.round(Number(unit?.area_m2 ?? row?.area_util))} m²` : "",
    cleanText(row?.bairro, 80),
    cleanText(row?.cidade || "São Paulo", 80),
  ].filter(Boolean);
  return cleanText(details.join(" · "), 180);
}

function imagesFor(entity, supabaseUrl) {
  const unit = entity.unit;
  const row = entity.row;
  const values = [
    unit?.capa_path,
    ...(Array.isArray(unit?.fotos) ? unit.fotos : []),
    row?.capa_path,
    ...(Array.isArray(row?.fotos) ? row.fotos : []),
  ];
  return [...new Set(values.map((value) => storageImage(value, supabaseUrl)).filter(Boolean))].slice(0, 12);
}

function offersFor(entity, url) {
  const row = entity.row;
  const unitPrice = finiteNumber(entity.unit?.valor, 1);
  const low = unitPrice ?? finiteNumber(row?.preco_min ?? row?.preco, 1);
  const high = unitPrice ?? finiteNumber(row?.preco_max ?? row?.preco, 1);
  if (!low && !high) return undefined;
  if (low && high && low !== high) return compactObject({
    "@type": "AggregateOffer",
    priceCurrency: "BRL",
    lowPrice: Math.min(low, high),
    highPrice: Math.max(low, high),
    availability: "https://schema.org/InStock",
    url,
  });
  return compactObject({
    "@type": "Offer",
    priceCurrency: "BRL",
    price: low ?? high,
    availability: "https://schema.org/InStock",
    url,
  });
}

export function metadataFor(entity, supabaseUrl) {
  const row = entity.row;
  const unit = entity.unit;
  const name = propertyName(entity);
  const title = cleanText(`${name} | apêcerto`, 70);
  const description = descriptionFor(entity);
  const canonical = canonicalForSlug(entity.slug);
  const images = imagesFor(entity, supabaseUrl);
  const area = finiteNumber(unit?.area_m2 ?? row?.area_util, 1, 10_000);
  const bedrooms = unitBedrooms(unit, row);
  const parking = finiteNumber(unit?.vagas ?? row?.vagas, 0, 100);
  const jsonLd = compactObject({
    "@context": "https://schema.org",
    "@type": "Apartment",
    name,
    description,
    url: canonical,
    image: images,
    address: {
      "@type": "PostalAddress",
      streetAddress: publicStreet(row?.endereco),
      addressLocality: cleanText(row?.cidade || "São Paulo", 80),
      addressRegion: cleanText(row?.uf || "SP", 8),
      addressCountry: "BR",
    },
    floorSize: area ? { "@type": "QuantitativeValue", value: area, unitCode: "MTK" } : undefined,
    numberOfRooms: bedrooms,
    numberOfParkingSpaces: parking,
    offers: offersFor(entity, canonical),
  });
  return { name, title, description, canonical, images, jsonLd };
}

function replaceOrInjectHead(html, pattern, tag) {
  let found = false;
  const updated = html.replace(pattern, () => {
    if (found) return "";
    found = true;
    return tag;
  });
  if (found) return updated;
  const closingHead = updated.search(/<\/head\s*>/i);
  if (closingHead < 0) throw new Error("shell_head_missing");
  return `${updated.slice(0, closingHead)}  ${tag}\n${updated.slice(closingHead)}`;
}

export function injectPropertyMetadata(shell, metadata, { noindex = false } = {}) {
  if (!/^\s*<!doctype\s+html/i.test(shell) || !/<head\b/i.test(shell) || !/<\/head\s*>/i.test(shell)) {
    throw new Error("shell_invalid");
  }
  const image = metadata.images?.[0] ?? "";
  let html = shell;
  html = replaceOrInjectHead(html, /<title\b[^>]*>[\s\S]*?<\/title\s*>/gi, `<title>${escapeHtml(metadata.title)}</title>`);
  html = replaceOrInjectHead(html, /<link\b(?=[^>]*\brel\s*=\s*["']canonical["'])[^>]*>/gi, `<link rel="canonical" href="${escapeHtml(metadata.canonical)}">`);
  html = replaceOrInjectHead(html, /<meta\b(?=[^>]*\bname\s*=\s*["']description["'])[^>]*>/gi, `<meta name="description" content="${escapeHtml(metadata.description)}">`);
  html = replaceOrInjectHead(html, /<meta\b(?=[^>]*\bname\s*=\s*["']robots["'])[^>]*>/gi, `<meta name="robots" content="${noindex ? "noindex,nofollow" : "index,follow,max-image-preview:large"}">`);
  html = replaceOrInjectHead(html, /<meta\b(?=[^>]*\bproperty\s*=\s*["']og:type["'])[^>]*>/gi, '<meta property="og:type" content="product">');
  html = replaceOrInjectHead(html, /<meta\b(?=[^>]*\bproperty\s*=\s*["']og:title["'])[^>]*>/gi, `<meta property="og:title" content="${escapeHtml(metadata.title)}">`);
  html = replaceOrInjectHead(html, /<meta\b(?=[^>]*\bproperty\s*=\s*["']og:description["'])[^>]*>/gi, `<meta property="og:description" content="${escapeHtml(metadata.description)}">`);
  html = replaceOrInjectHead(html, /<meta\b(?=[^>]*\bproperty\s*=\s*["']og:url["'])[^>]*>/gi, `<meta property="og:url" content="${escapeHtml(metadata.canonical)}">`);
  html = replaceOrInjectHead(html, /<meta\b(?=[^>]*\bname\s*=\s*["']twitter:card["'])[^>]*>/gi, `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`);
  html = replaceOrInjectHead(html, /<meta\b(?=[^>]*\bname\s*=\s*["']twitter:title["'])[^>]*>/gi, `<meta name="twitter:title" content="${escapeHtml(metadata.title)}">`);
  html = replaceOrInjectHead(html, /<meta\b(?=[^>]*\bname\s*=\s*["']twitter:description["'])[^>]*>/gi, `<meta name="twitter:description" content="${escapeHtml(metadata.description)}">`);
  if (image) {
    html = replaceOrInjectHead(html, /<meta\b(?=[^>]*\bproperty\s*=\s*["']og:image["'])[^>]*>/gi, `<meta property="og:image" content="${escapeHtml(image)}">`);
    html = replaceOrInjectHead(html, /<meta\b(?=[^>]*\bname\s*=\s*["']twitter:image["'])[^>]*>/gi, `<meta name="twitter:image" content="${escapeHtml(image)}">`);
  } else {
    html = html.replace(/<meta\b(?=[^>]*\bproperty\s*=\s*["']og:image["'])[^>]*>\s*/gi, "");
    html = html.replace(/<meta\b(?=[^>]*\bname\s*=\s*["']twitter:image["'])[^>]*>\s*/gi, "");
  }
  html = html.replace(/<script\b(?=[^>]*\bid\s*=\s*["']apecerto-imovel-jsonld["'])[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  const closingHead = html.search(/<\/head\s*>/i);
  if (closingHead < 0) throw new Error("shell_head_missing");
  const jsonLd = `<script id="apecerto-imovel-jsonld" type="application/ld+json">${safeJson(metadata.jsonLd)}</script>\n`;
  return `${html.slice(0, closingHead)}  ${jsonLd}${html.slice(closingHead)}`;
}

function findEntity(rows, slug) {
  const matches = catalogEntities(rows).filter((entity) => entity.slug === slug);
  if (matches.length > 1) throw new Error("catalog_slug_ambiguous");
  return matches[0] ?? null;
}

async function fetchShell(fetchImpl) {
  const response = await fetchImpl(SHELL_URL, {
    method: "GET",
    headers: { Accept: "text/html", "User-Agent": "ApeCerto-SEO/1.0" },
    redirect: "follow",
    signal: AbortSignal.timeout(7_000),
  });
  if (!response.ok) throw new Error(`shell_unavailable_${response.status}`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_SHELL_BYTES) throw new Error("shell_too_large");
  const shell = await response.text();
  if (new TextEncoder().encode(shell).length > MAX_SHELL_BYTES) throw new Error("shell_too_large");
  return shell;
}

async function etagFor(body) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `"${hash}"`;
}

function baseHeaders(contentType, cacheControl) {
  return {
    "Content-Type": contentType,
    "Cache-Control": cacheControl,
    "CDN-Cache-Control": cacheControl,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    Vary: "Accept-Encoding",
  };
}

async function contentResponse(request, body, { status = 200, contentType, cacheControl = SUCCESS_CACHE, noindex = false }) {
  const etag = await etagFor(body);
  const headers = new Headers(baseHeaders(contentType, cacheControl));
  headers.set("ETag", etag);
  if (contentType.startsWith("text/html")) headers.set("Content-Language", "pt-BR");
  if (noindex) headers.set("X-Robots-Tag", "noindex, nofollow");
  const candidates = (request.headers.get("if-none-match") ?? "").split(",").map((value) => value.trim().replace(/^W\//, ""));
  if (status === 200 && candidates.includes(etag)) return new Response(null, { status: 304, headers });
  return new Response(request.method === "HEAD" ? null : body, { status, headers });
}

function errorResponse(request, status, code) {
  const body = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Serviço indisponível | apêcerto</title></head><body>Serviço temporariamente indisponível.</body></html>`;
  return contentResponse(request, body, {
    status,
    contentType: "text/html; charset=utf-8",
    cacheControl: "no-store",
    noindex: true,
  }).then((response) => {
    response.headers.set("X-ApeCerto-Error", code);
    return response;
  });
}

function permanentRedirect(request, slug) {
  const headers = new Headers(baseHeaders("text/plain; charset=utf-8", "public, max-age=300, s-maxage=3600"));
  headers.set("Location", canonicalForSlug(slug));
  headers.set("X-Robots-Tag", "noindex, nofollow");
  return new Response(request.method === "HEAD" ? null : "", { status: 301, headers });
}

function routeOf(url) {
  const marker = "/site-seo";
  const markerIndex = url.pathname.lastIndexOf(marker);
  const path = markerIndex >= 0 ? url.pathname.slice(markerIndex + marker.length) || "/" : url.pathname;
  if (path === "/sitemap.xml") return { type: "sitemap" };
  const property = path.match(/^\/imovel\/([^/]+)\/?$/);
  return property ? { type: "property", rawSlug: property[1] } : { type: "unknown" };
}

export function createSiteSeoHandler(dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const env = dependencies.env ?? { get: (name) => Deno.env.get(name) };
  return async function siteSeoHandler(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: baseHeaders("text/plain; charset=utf-8", "no-store") });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      const response = await errorResponse(request, 405, "method_not_allowed");
      response.headers.set("Allow", "GET, HEAD, OPTIONS");
      return response;
    }
    const route = routeOf(new URL(request.url));
    if (route.type === "unknown") return errorResponse(request, 404, "route_not_found");
    try {
      const { rows, supabaseUrl } = await fetchCatalog({ fetchImpl, env });
      if (route.type === "sitemap") {
        return contentResponse(request, buildSitemap(rows), { contentType: "application/xml; charset=utf-8" });
      }
      const slug = decodeRequestedSlug(route.rawSlug);
      const entity = slug ? findEntity(rows, slug) : null;
      if (!entity) {
        const resolved = slug ? await fetchLegacyResolution({ fetchImpl, env, supabaseUrl, slug }) : "";
        if (resolved && resolved !== slug && findEntity(rows, resolved)) return permanentRedirect(request, resolved);
        const shell = await fetchShell(fetchImpl);
        const metadata = {
          title: "Imóvel não encontrado | apêcerto",
          description: "Este imóvel não está disponível no catálogo público da apêcerto.",
          canonical: slug ? canonicalForSlug(slug) : `${SITE_ORIGIN}/imovel/nao-encontrado/`,
          images: [],
          jsonLd: { "@context": "https://schema.org", "@type": "WebPage", name: "Imóvel não encontrado" },
        };
        return contentResponse(request, injectPropertyMetadata(shell, metadata, { noindex: true }), {
          status: 404,
          contentType: "text/html; charset=utf-8",
          cacheControl: NOT_FOUND_CACHE,
          noindex: true,
        });
      }
      const shell = await fetchShell(fetchImpl);
      const metadata = metadataFor(entity, supabaseUrl);
      return contentResponse(request, injectPropertyMetadata(shell, metadata), { contentType: "text/html; charset=utf-8" });
    } catch (error) {
      const code = error instanceof Error && /^[a-z0-9_]+$/i.test(error.message) ? error.message : "unexpected_error";
      return errorResponse(request, 503, code);
    }
  };
}

if (typeof Deno !== "undefined" && Deno?.serve) Deno.serve(createSiteSeoHandler());

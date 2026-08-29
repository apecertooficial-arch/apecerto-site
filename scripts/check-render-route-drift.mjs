import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const LEGACY_SOURCE = "/imovel/*";
const LEGACY_HEADER_NAME = "Content-Type";

function escapeRegex(value) {
  return value.replace(/[.*+?^$()|[\]\\{}]/g, "\\$&");
}

export function expectedLegacyRule(renderYaml) {
  const match = renderYaml.match(new RegExp(
    "-\\s+type:\\s*(redirect|rewrite)\\s*\\n\\s*source:\\s*" + escapeRegex(LEGACY_SOURCE)
      + "\\s*\\n\\s*destination:\\s*([^\\s#]+)",
    "i",
  ));
  if (!match) return null;
  return { action: match[1].toLowerCase(), source: LEGACY_SOURCE, destination: match[2] };
}

export function expectedLegacyHeader(renderYaml) {
  const match = renderYaml.match(new RegExp(
    "-\\s+path:\\s*" + escapeRegex(LEGACY_SOURCE)
      + "\\s*\\n\\s*name:\\s*" + escapeRegex(LEGACY_HEADER_NAME)
      + "\\s*\\n\\s*value:\\s*([^\\n#]+)",
    "i",
  ));
  if (!match) throw new Error("O Content-Type legado versionado não foi encontrado.");
  return { path: LEGACY_SOURCE, name: LEGACY_HEADER_NAME, value: match[1].trim() };
}

function normalizeActiveRule(rule) {
  if (!rule || typeof rule !== "object") return null;
  const source = typeof rule.source === "string" ? rule.source.trim() : "";
  const destination = typeof rule.destination === "string" ? rule.destination.trim() : "";
  const action = typeof rule.action === "string" ? rule.action.trim().toLowerCase() : "";
  return source && destination && ["redirect", "rewrite"].includes(action)
    ? { source, destination, action }
    : null;
}

function normalizeActiveHeader(header) {
  if (!header || typeof header !== "object") return null;
  const path = typeof header.path === "string" ? header.path.trim() : "";
  const name = typeof header.name === "string" ? header.name.trim() : "";
  const value = typeof header.value === "string" ? header.value.trim() : "";
  return path && name && value ? { path, name, value } : null;
}

export function checkRenderRouteDrift(renderYaml, activeRules, activeHeaders) {
  const expected = expectedLegacyRule(renderYaml);
  const expectedHeader = expectedLegacyHeader(renderYaml);
  const normalized = Array.isArray(activeRules) ? activeRules.map(normalizeActiveRule).filter(Boolean) : [];
  const legacyRules = normalized.filter((rule) => rule.source === LEGACY_SOURCE);
  const drift = [];
  if (!expected) {
    if (legacyRules.length) drift.push("unexpected_active_rule");
  } else {
    const active = legacyRules[0];
    if (!active) drift.push("missing_active_rule");
    else {
      if (active.action !== expected.action) drift.push("action");
      if (active.destination !== expected.destination) drift.push("destination");
      if (legacyRules.length !== 1) drift.push("duplicate_source");
    }
  }
  const normalizedHeaders = Array.isArray(activeHeaders) ? activeHeaders.map(normalizeActiveHeader).filter(Boolean) : [];
  const matchingHeaders = normalizedHeaders.filter((header) => header.path === expectedHeader.path && header.name.toLowerCase() === expectedHeader.name.toLowerCase());
  if (matchingHeaders.length === 0) drift.push("missing_active_header");
  else {
    if (matchingHeaders[0].value.toLowerCase() !== expectedHeader.value.toLowerCase()) drift.push("header_value");
    if (matchingHeaders.length !== 1) drift.push("duplicate_header");
  }
  return { ok: drift.length === 0, drift };
}

async function main(env) {
  const rawSnapshot = env.RENDER_ACTIVE_RULES_JSON;
  if (!rawSnapshot) throw new Error("RENDER_ACTIVE_RULES_JSON ausente; forneça somente o snapshot sanitizado das regras ativas.");
  const rawHeaders = env.RENDER_ACTIVE_HEADERS_JSON;
  if (!rawHeaders) throw new Error("RENDER_ACTIVE_HEADERS_JSON ausente; forneça somente o snapshot sanitizado dos headers ativos.");
  let activeRules;
  let activeHeaders;
  try {
    activeRules = JSON.parse(rawSnapshot);
    activeHeaders = JSON.parse(rawHeaders);
  } catch {
    throw new Error("Snapshot sanitizado do Render inválido.");
  }
  const renderYaml = await readFile("render.yaml", "utf8");
  const result = checkRenderRouteDrift(renderYaml, activeRules, activeHeaders);
  if (!result.ok) throw new Error(`Drift do Render detectado: ${result.drift.join(",")}.`);
  console.log(JSON.stringify({ event: "render_route_drift", ok: true, source: LEGACY_SOURCE }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.env).catch((error) => {
    console.error(JSON.stringify({ event: "render_route_drift", ok: false, error: error instanceof Error ? error.message : "Falha desconhecida." }));
    process.exitCode = 1;
  });
}

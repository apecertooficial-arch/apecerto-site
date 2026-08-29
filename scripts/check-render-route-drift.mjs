import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const LEGACY_SOURCE = "/imovel/*";

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

function normalizeActiveRule(rule) {
  if (!rule || typeof rule !== "object") return null;
  const source = typeof rule.source === "string" ? rule.source.trim() : "";
  const destination = typeof rule.destination === "string" ? rule.destination.trim() : "";
  const action = typeof rule.action === "string" ? rule.action.trim().toLowerCase() : "";
  return source && destination && ["redirect", "rewrite"].includes(action)
    ? { source, destination, action }
    : null;
}

export function checkRenderRouteDrift(renderYaml, activeRules) {
  const expected = expectedLegacyRule(renderYaml);
  const normalized = Array.isArray(activeRules) ? activeRules.map(normalizeActiveRule).filter(Boolean) : [];
  const legacyRules = normalized.filter((rule) => rule.source === LEGACY_SOURCE);
  if (!expected) return legacyRules.length ? { ok: false, drift: ["unexpected_active_rule"] } : { ok: true, drift: [] };
  const active = legacyRules[0];
  if (!active) return { ok: false, drift: ["missing_active_rule"] };
  const drift = [];
  if (active.action !== expected.action) drift.push("action");
  if (active.destination !== expected.destination) drift.push("destination");
  if (legacyRules.length !== 1) drift.push("duplicate_source");
  return { ok: drift.length === 0, drift };
}

async function main(env) {
  const rawSnapshot = env.RENDER_ACTIVE_RULES_JSON;
  if (!rawSnapshot) throw new Error("RENDER_ACTIVE_RULES_JSON ausente; forneça somente o snapshot sanitizado das regras ativas.");
  let activeRules;
  try {
    activeRules = JSON.parse(rawSnapshot);
  } catch {
    throw new Error("RENDER_ACTIVE_RULES_JSON inválido.");
  }
  const renderYaml = await readFile("render.yaml", "utf8");
  const result = checkRenderRouteDrift(renderYaml, activeRules);
  if (!result.ok) throw new Error(`Drift do Render detectado: ${result.drift.join(",")}.`);
  console.log(JSON.stringify({ event: "render_route_drift", ok: true, source: LEGACY_SOURCE }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.env).catch((error) => {
    console.error(JSON.stringify({ event: "render_route_drift", ok: false, error: error instanceof Error ? error.message : "Falha desconhecida." }));
    process.exitCode = 1;
  });
}

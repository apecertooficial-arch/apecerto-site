const SENSITIVE_QUERY_KEYS = new Set([
  "access_token", "refresh_token", "token", "token_hash", "code",
  "error", "error_code", "error_description", "email", "e-mail",
  "telefone", "phone", "phone_number", "nome", "name", "cpf", "rg",
  "endereco", "address", "cep", "postal_code", "renda", "income",
]);

const PII_CUSTOM_DATA_KEYS = new Set([
  "email", "e-mail", "telefone", "phone", "phone_number", "nome", "name",
  "full_name", "cpf", "rg", "endereco", "address", "cep", "postal_code",
  "renda", "income",
]);
const ALLOWED_EVENT_HOSTS = new Set(["apecerto.com", "www.apecerto.com"]);

export function normalizeEmail(value: unknown) {
  const email = String(value ?? "").normalize("NFKC").trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "";
  return email;
}

export function normalizeBrazilPhone(value: unknown) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^[1-9]\d{9,10}$/.test(digits)) digits = `55${digits}`;
  return /^55[1-9]\d{9,10}$/.test(digits) ? digits : "";
}

export async function sha256Hex(value: unknown) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value ?? "")));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashedEmail(value: unknown) {
  const normalized = normalizeEmail(value);
  return normalized ? sha256Hex(normalized) : "";
}

export async function hashedBrazilPhone(value: unknown) {
  const normalized = normalizeBrazilPhone(value);
  return normalized ? sha256Hex(normalized) : "";
}

export function safeEventSourceUrl(value: unknown, fallback = "https://apecerto.com/") {
  try {
    const url = new URL(String(value ?? ""), fallback);
    if (url.protocol !== "https:") return fallback;
    if (!ALLOWED_EVENT_HOSTS.has(url.hostname.toLowerCase())) return fallback;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return fallback;
  }
}

export function sanitizeMetaCustomData(value: unknown) {
  const sanitized: Record<string, string | number | boolean> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return sanitized;
  for (const [key, item] of Object.entries(value)) {
    if (PII_CUSTOM_DATA_KEYS.has(key.toLowerCase())) continue;
    if (typeof item === "string" || typeof item === "boolean") sanitized[key] = item;
    else if (typeof item === "number" && Number.isFinite(item)) sanitized[key] = item;
  }
  return sanitized;
}

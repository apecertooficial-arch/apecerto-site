import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CACHE = "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800";

function response(status: number, body: BodyInit | null, contentType = "text/plain; charset=utf-8") {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": status === 200 ? CACHE : "public, max-age=30, s-maxage=60",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Referrer-Policy": "no-referrer",
    },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return response(204, null);
  if (request.method !== "GET" && request.method !== "HEAD") return response(405, "Método não permitido.");

  const url = new URL(request.url);
  const id = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
  if (!UUID.test(id)) return response(404, "Imagem não encontrada.");

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return response(503, "Imagem temporariamente indisponível.");

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: media, error } = await supabase
    .from("midias")
    .select("storage_path,empreendimento_id,unidade_id,tipo")
    .eq("id", id)
    .eq("tipo", "foto")
    .maybeSingle();
  if (error || !media?.storage_path || !media.empreendimento_id) return response(404, "Imagem não encontrada.");

  const { data: product } = await supabase
    .from("empreendimentos")
    .select("id")
    .eq("id", media.empreendimento_id)
    .eq("publicado", true)
    .eq("rascunho", false)
    .eq("aprovacao", "aprovado")
    .maybeSingle();
  if (!product) return response(404, "Imagem não encontrada.");

  if (media.unidade_id) {
    const { data: unit } = await supabase
      .from("unidades")
      .select("id")
      .eq("id", media.unidade_id)
      .eq("empreendimento_id", media.empreendimento_id)
      .eq("publicado", true)
      .eq("disponivel", true)
      .eq("aprovacao", "aprovado")
      .maybeSingle();
    if (!unit) return response(404, "Imagem não encontrada.");
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from("empreendimentos")
    .createSignedUrl(media.storage_path, 60);
  if (signedError || !signed?.signedUrl) return response(404, "Imagem não encontrada.");

  const upstream = await fetch(signed.signedUrl, {
    method: request.method,
    redirect: "error",
    signal: AbortSignal.timeout(8_000),
  });
  if (!upstream.ok) return response(502, "Imagem temporariamente indisponível.");
  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  if (!contentType.startsWith("image/")) return response(415, "Formato não permitido.");

  const result = response(200, request.method === "HEAD" ? null : upstream.body, contentType);
  const length = upstream.headers.get("content-length");
  if (length) result.headers.set("Content-Length", length);
  return result;
});

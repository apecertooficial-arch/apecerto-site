import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://apecerto.com",
  "https://www.apecerto.com",
]);

type CatalogRow = {
  id: string;
  nome: string | null;
  bairro: string | null;
  status: string | null;
  area_util: number | null;
  dormitorios: number | null;
  vagas: number | null;
  preco: number | null;
  preco_min: number | null;
  preco_max: number | null;
  area_min_disponivel: number | null;
  area_max_disponivel: number | null;
  dormitorios_min_disponiveis: number | null;
  dormitorios_max_disponiveis: number | null;
  vagas_min_disponiveis: number | null;
  vagas_max_disponiveis: number | null;
  tipologias_disponiveis: string[] | null;
  finalidade: string | null;
  lazer: string[] | null;
  diferenciais: string[] | null;
  descricao: string | null;
  unidades_site: UnitRow[] | null;
};

type UnitRow = {
  id: string;
  slug: string | null;
  area_m2: number | null;
  tipologia: string | null;
  vagas: number | null;
  valor: number | null;
};

type Filters = {
  finalidade: "venda" | "aluguel" | null;
  bairro: string | null;
  status: "pronto" | "em_obras" | "lancamento" | null;
  dormitorios_min: number | null;
  dormitorios_max: number | null;
  vagas_min: number | null;
  preco_max: number | null;
  area_min: number | null;
  caracteristicas: string[];
};

const blankFilters = (): Filters => ({
  finalidade: null,
  bairro: null,
  status: null,
  dormitorios_min: null,
  dormitorios_max: null,
  vagas_min: null,
  preco_max: null,
  area_min: null,
  caracteristicas: [],
});

const normalize = (value: unknown) => String(value ?? "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .trim();

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://apecerto.com";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(origin: string | null, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function priceOf(row: CatalogRow) {
  return Number(row.preco_min ?? row.preco ?? 0) || 0;
}

function unitPrice(unit: UnitRow) {
  return Number(unit.valor ?? 0) || 0;
}

function unitBedrooms(unit: UnitRow) {
  const typology = normalize(unit.tipologia);
  if (typology.includes("studio")) return 0;
  const match = typology.match(/^(\d+)/);
  return match ? Number(match[1]) : null;
}

function sanitizeFilters(value: Partial<Filters>, knownNeighborhoods: string[]): Filters {
  const out = blankFilters();
  const finalidade = normalize(value.finalidade);
  out.finalidade = finalidade === "aluguel" || finalidade === "venda" ? finalidade : null;
  const requestedNeighborhood = normalize(value.bairro);
  out.bairro = knownNeighborhoods.find((item) => normalize(item) === requestedNeighborhood) ?? null;
  out.status = ["pronto", "em_obras", "lancamento"].includes(String(value.status))
    ? value.status as Filters["status"]
    : null;
  const integer = (candidate: unknown, max: number) => {
    const parsed = Number(candidate);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.min(max, Math.round(parsed)) : null;
  };
  const money = (candidate: unknown) => {
    const parsed = Number(candidate);
    const minimum = out.finalidade === "aluguel" ? 500 : 100000;
    const maximum = out.finalidade === "aluguel" ? 500000 : 100000000;
    return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? Math.round(parsed) : null;
  };
  out.dormitorios_min = integer(value.dormitorios_min, 20);
  out.dormitorios_max = integer(value.dormitorios_max, 20);
  out.vagas_min = integer(value.vagas_min, 20);
  if (out.vagas_min === 0) out.vagas_min = null;
  out.preco_max = money(value.preco_max);
  out.area_min = integer(value.area_min, 2000);
  if (out.area_min === 0) out.area_min = null;
  out.caracteristicas = Array.isArray(value.caracteristicas)
    ? value.caracteristicas.map(normalize).filter((item) => item && !["studio", "apartamento", "ape", "imovel"].includes(item)).slice(0, 5)
    : [];
  return out;
}

function parseWithRules(question: string, neighborhoods: string[]): Filters {
  const text = normalize(question);
  const out = blankFilters();
  if (/alug|loca|mensal/.test(text)) out.finalidade = "aluguel";
  else if (/compr|venda|adquir/.test(text)) out.finalidade = "venda";
  out.bairro = neighborhoods.find((item) => text.includes(normalize(item))) ?? null;
  if (/pronto|pronta|morar agora/.test(text)) out.status = "pronto";
  else if (/obra/.test(text)) out.status = "em_obras";
  else if (/lancamento/.test(text)) out.status = "lancamento";

  if (/studio|kitnet/.test(text)) {
    out.dormitorios_min = 0;
    out.dormitorios_max = 1;
  } else {
    const dorms = text.match(/(\d+)\s*(?:\+|ou mais)?\s*(?:dorm|quarto)/);
    if (dorms) {
      out.dormitorios_min = Number(dorms[1]);
      out.dormitorios_max = /\+|ou mais/.test(dorms[0]) ? null : Number(dorms[1]);
    }
  }
  const vagas = text.match(/(\d+)\s*(?:\+|ou mais)?\s*vaga/);
  if (vagas) out.vagas_min = Number(vagas[1]);
  else if (/vaga|garagem/.test(text)) out.vagas_min = 1;

  const price = text.match(/([\d]+(?:[.,]\d+)?)\s*(mil|k|mi|milhao|milhoes|m)\b/);
  if (price) {
    const base = Number(price[1].replace(",", "."));
    out.preco_max = Math.round(base * (/mil|k/.test(price[2]) ? 1000 : 1000000));
  }
  const area = text.match(/(?:acima de|mais de|pelo menos|minimo)\s*(\d+)\s*m/);
  if (area) out.area_min = Number(area[1]);
  return out;
}

async function parseWithAI(question: string, neighborhoods: string[], model: string, apiKey: string) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_completion_tokens: 450,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "busca_imovel",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              finalidade: { type: ["string", "null"], enum: ["venda", "aluguel", null] },
              bairro: { type: ["string", "null"] },
              status: { type: ["string", "null"], enum: ["pronto", "em_obras", "lancamento", null] },
              dormitorios_min: { type: ["integer", "null"] },
              dormitorios_max: { type: ["integer", "null"] },
              vagas_min: { type: ["integer", "null"] },
              preco_max: { type: ["number", "null"] },
              area_min: { type: ["integer", "null"] },
              caracteristicas: { type: "array", items: { type: "string" }, maxItems: 5 },
            },
            required: ["finalidade", "bairro", "status", "dormitorios_min", "dormitorios_max", "vagas_min", "preco_max", "area_min", "caracteristicas"],
          },
        },
      },
      messages: [
        {
          role: "system",
          content: `Você é a Sara da ApeCerto. Extraia somente filtros objetivos de uma busca de imóvel. Finalidade deve ser venda, aluguel ou nula. Não invente bairro. Bairros disponíveis: ${neighborhoods.join(", ")}. Valores como 800 mil significam 800000. Aluguel de 5000 significa 5000, não 5 milhões. "2 quartos" significa exatamente 2; "2 ou mais" significa mínimo 2 e máximo nulo. Responda apenas no JSON exigido.`,
        },
        { role: "user", content: question },
      ],
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(String(data?.error?.message ?? `OpenAI ${response.status}`));
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Resposta vazia da IA");
  return JSON.parse(content) as Partial<Filters>;
}

function matchCatalog(rows: CatalogRow[], filters: Filters) {
  return rows.flatMap((row) => {
    const finalidade = normalize(row.finalidade);
    const purposeMatches = !filters.finalidade
      || (filters.finalidade === "aluguel"
        ? ["aluguel", "alugar", "locacao", "ambos", "venda_e_aluguel", "venda e aluguel", "venda ou aluguel"].includes(finalidade)
        : !["aluguel", "alugar", "locacao"].includes(finalidade));
    const haystack = normalize([
      row.nome,
      row.descricao,
      ...(row.tipologias_disponiveis ?? []),
      ...(row.lazer ?? []),
      ...(row.diferenciais ?? []),
    ].join(" "));
    const propertyMatches = purposeMatches
      && (!filters.bairro || normalize(row.bairro) === normalize(filters.bairro))
      && (!filters.status || row.status === filters.status)
      && filters.caracteristicas.every((item) => haystack.includes(normalize(item)));
    if (!propertyMatches) return [];

    // `unidades_site` vem da mesma view publica da vitrine. Assim a Sara nunca
    // consulta ou recomenda unidade pendente, despublicada ou indisponivel.
    const available = Array.isArray(row.unidades_site) ? row.unidades_site : [];
    const hasUnitFilters = filters.dormitorios_min != null || filters.dormitorios_max != null
      || filters.vagas_min != null || filters.preco_max != null || filters.area_min != null;
    if (!available.length) {
      if (!hasUnitFilters) return [{ row, price: priceOf(row), unit: null }];
      const bedrooms = row.dormitorios == null ? null : Number(row.dormitorios);
      const price = priceOf(row);
      const fallbackMatches = (filters.dormitorios_min == null || (bedrooms != null && bedrooms >= filters.dormitorios_min))
        && (filters.dormitorios_max == null || (bedrooms != null && bedrooms <= filters.dormitorios_max))
        && (filters.vagas_min == null || Number(row.vagas ?? -1) >= filters.vagas_min)
        && (filters.preco_max == null || (price > 0 && price <= filters.preco_max))
        && (filters.area_min == null || Number(row.area_util ?? -1) >= filters.area_min);
      return fallbackMatches ? [{ row, price, unit: null }] : [];
    }

    const matchingUnits = available.filter((unit) => {
      const bedrooms = unitBedrooms(unit) ?? (row.dormitorios == null ? null : Number(row.dormitorios));
      const price = unitPrice(unit);
      return (filters.dormitorios_min == null || (bedrooms != null && bedrooms >= filters.dormitorios_min))
        && (filters.dormitorios_max == null || (bedrooms != null && bedrooms <= filters.dormitorios_max))
        && (filters.vagas_min == null || Number(unit.vagas ?? -1) >= filters.vagas_min)
        && (filters.preco_max == null || (price > 0 && price <= filters.preco_max))
        && (filters.area_min == null || Number(unit.area_m2 ?? -1) >= filters.area_min);
    });
    if (!matchingUnits.length) return [];
    return matchingUnits.slice().sort((a, b) => {
      const priceA = unitPrice(a) || Number.MAX_SAFE_INTEGER;
      const priceB = unitPrice(b) || Number.MAX_SAFE_INTEGER;
      return priceA - priceB;
    }).map((unit) => ({ row, price: unitPrice(unit) || priceOf(row), unit }));
  }).sort((a, b) => a.price - b.price);
}

function describe(filters: Filters) {
  const parts: string[] = [];
  if (filters.finalidade === "aluguel") parts.push("para alugar");
  if (filters.finalidade === "venda") parts.push("para comprar");
  if (filters.dormitorios_min != null) {
    parts.push(filters.dormitorios_min === 0 && filters.dormitorios_max === 0
      ? 'studio'
      : filters.dormitorios_max === filters.dormitorios_min
      ? `${filters.dormitorios_min} dorm${filters.dormitorios_min === 1 ? "" : "s"}`
      : `${filters.dormitorios_min}+ dorms`);
  }
  if (filters.vagas_min != null) parts.push(`${filters.vagas_min}+ vaga${filters.vagas_min === 1 ? "" : "s"}`);
  if (filters.preco_max != null) parts.push(`até R$ ${Math.round(filters.preco_max).toLocaleString("pt-BR")}`);
  if (filters.bairro) parts.push(`em ${filters.bairro}`);
  if (filters.status === "pronto") parts.push("pronto pra morar");
  if (filters.status === "em_obras") parts.push("em obras");
  if (filters.status === "lancamento") parts.push("lançamento");
  if (filters.area_min != null) parts.push(`a partir de ${filters.area_min} m²`);
  if (filters.caracteristicas.length) parts.push(filters.caracteristicas.join(", "));
  return parts;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (request.method !== "POST") return json(origin, { ok: false, erro: "metodo_nao_permitido" }, 405);
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return json(origin, { ok: false, erro: "origem_nao_permitida" }, 403);

  try {
    const body = await request.json().catch(() => ({}));
    const question = String(body?.pergunta ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    if (question.length < 3 || question.length > 240) {
      return json(origin, { ok: false, erro: "pergunta_invalida" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const ip = request.headers.get("cf-connecting-ip")
      ?? request.headers.get("x-real-ip")
      ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? "sem-ip";
    const clientId = String(body?.client_id ?? "").slice(0, 80);
    // O identificador do navegador é controlável pelo visitante, então ele só
    // complementa o limite primário de infraestrutura. Trocar client_id nunca
    // reinicia a cota principal do IP recebido do proxy da Edge.
    const [infraHash, clientHash] = await Promise.all([
      sha256(`sara-infra-v1|${ip}`),
      sha256(`sara-client-v1|${ip}|${clientId || "sem-cliente"}`),
    ]);
    const [infraLimit, clientLimit] = await Promise.all([
      supabase.rpc("sara_site_rate_check", { p_client_hash: infraHash, p_limit: 60 }),
      supabase.rpc("sara_site_rate_check", { p_client_hash: clientHash, p_limit: 20 }),
    ]);
    if (infraLimit.error || clientLimit.error) return json(origin, { ok: false, erro: "controle_indisponivel" }, 503);
    if (!infraLimit.data || !clientLimit.data) return json(origin, { ok: false, erro: "limite_atingido", mensagem: "Muitas buscas seguidas. Tenta de novo em alguns minutos." }, 429);

    const { data: rows, error: catalogError } = await supabase
      .from("site_produtos")
      .select("id,nome,bairro,status,area_util,dormitorios,vagas,preco,preco_min,preco_max,area_min_disponivel,area_max_disponivel,dormitorios_min_disponiveis,dormitorios_max_disponiveis,vagas_min_disponiveis,vagas_max_disponiveis,tipologias_disponiveis,finalidade,lazer,diferenciais,descricao,unidades_site")
      .limit(500);
    if (catalogError) return json(origin, { ok: false, erro: "catalogo_indisponivel" }, 503);

    const catalog = (rows ?? []) as CatalogRow[];
    const neighborhoods = Array.from(new Set(catalog.map((row) => row.bairro).filter(Boolean) as string[])).sort();
    const requestedPurpose = normalize(body?.finalidade);
    const explicitPurpose = requestedPurpose === "aluguel" || requestedPurpose === "venda"
      ? requestedPurpose as Filters["finalidade"]
      : null;
    let apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      const { data: secret } = await supabase.from("app_secrets").select("valor").eq("chave", "OPENAI_API_KEY").maybeSingle();
      apiKey = secret?.valor;
    }
    const { data: agent } = await supabase.from("agentes_ia").select("modelo,ativo").eq("slug", "sara").maybeSingle();
    const model = agent?.modelo ?? "gpt-5.4-nano";

    let source = "regras";
    let parsed: Partial<Filters> = parseWithRules(question, neighborhoods);
    if (explicitPurpose) parsed.finalidade = explicitPurpose;
    if (apiKey && agent?.ativo !== false) {
      try {
        parsed = await parseWithAI(question, neighborhoods, model, apiKey);
        if (explicitPurpose) parsed.finalidade = explicitPurpose;
        source = "ia";
      } catch {
        source = "regras";
      }
    }

    const filters = sanitizeFilters(parsed, neighborhoods);
    const parts = describe(filters);
    if (!parts.length) {
      return json(origin, {
        ok: true,
        count: 0,
        ids: [],
        filters,
        source,
        reply: "Me conta pelo menos bairro, preço, dormitórios ou vagas. Exemplo: 2 dorms com vaga em Moema até 800 mil.",
      });
    }

    const matches = matchCatalog(catalog, filters);
    const summary = parts.join(", ");
    const reply = matches.length
      ? `Encontrei ${matches.length} ${matches.length === 1 ? "apê" : "apês"}: ${summary}. Ordenei do menor preço para o maior. 🔑`
      : `Não encontrei nenhum apê que cumpra todos os filtros (${summary}). Posso tentar com um critério a menos.`;
    return json(origin, {
      ok: true,
      count: matches.length,
      ids: matches.map((match) => match.unit?.id ?? match.row.id),
      prices: Object.fromEntries(matches.map((match) => [match.unit?.id ?? match.row.id, match.price])),
      units: Object.fromEntries(matches.map((match) => [match.unit?.id ?? match.row.id, {
        id: match.unit?.id ?? null,
        slug: match.unit?.slug ?? null,
        empreendimento_id: match.row.id,
        area: match.unit?.area_m2 ?? match.row.area_util,
        dormitorios: match.unit ? (unitBedrooms(match.unit) ?? match.row.dormitorios) : match.row.dormitorios,
        vagas: match.unit?.vagas ?? match.row.vagas,
        preco: match.price,
      }])),
      filters,
      source,
      reply,
    });
  } catch {
    return json(origin, { ok: false, erro: "falha_inesperada", mensagem: "Não consegui buscar agora. Tenta de novo em instantes." }, 500);
  }
});

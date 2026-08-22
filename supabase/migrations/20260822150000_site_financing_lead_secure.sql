-- Porta pública dedicada ao pedido de financiamento.
-- O navegador não escreve financiamento diretamente em site_leads: a Edge
-- normaliza o payload e esta RPC service-only faz rate limit, deduplicação e
-- criação do lead na mesma transação.

set lock_timeout = '5s';
set statement_timeout = '30s';

create table if not exists private.site_financing_lead_rate_usage (
  scope text not null check (scope in ('ip', 'client')),
  client_hash text not null check (client_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null,
  requests integer not null default 1 check (requests > 0),
  last_request_at timestamptz not null default now(),
  primary key (scope, client_hash, window_start)
);

create table if not exists private.site_financing_lead_receipts (
  request_id uuid primary key,
  conversion_event_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[0-9a-f]{64}$'),
  dedupe_hash text not null check (dedupe_hash ~ '^[0-9a-f]{64}$'),
  site_lead_id uuid references public.site_leads(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists site_financing_lead_receipts_created_idx
  on private.site_financing_lead_receipts (created_at desc);
create index if not exists site_financing_lead_receipts_dedupe_idx
  on private.site_financing_lead_receipts (dedupe_hash, created_at desc);
create index if not exists site_financing_lead_rate_window_idx
  on private.site_financing_lead_rate_usage (window_start);

alter table private.site_financing_lead_rate_usage enable row level security;
alter table private.site_financing_lead_rate_usage force row level security;
alter table private.site_financing_lead_receipts enable row level security;
alter table private.site_financing_lead_receipts force row level security;

revoke all on table private.site_financing_lead_rate_usage
  from public, anon, authenticated, service_role;
revoke all on table private.site_financing_lead_receipts
  from public, anon, authenticated, service_role;

comment on table private.site_financing_lead_rate_usage is
  'Contadores temporários sem IP bruto: HMAC por IP confiável e por page_view_id.';
comment on table private.site_financing_lead_receipts is
  'Recibo privado, sem PII, para idempotência do lead e da conversão de financiamento.';

create or replace function private.site_financing_rate_take(
  p_scope text,
  p_client_hash text,
  p_window_seconds integer,
  p_limit integer
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_requests integer;
begin
  if p_scope not in ('ip', 'client')
     or p_client_hash is null
     or p_client_hash !~ '^[0-9a-f]{64}$'
     or p_window_seconds not between 60 and 86400
     or p_limit not between 1 and 100 then
    return false;
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds)
    * p_window_seconds
  );

  insert into private.site_financing_lead_rate_usage (
    scope, client_hash, window_start, requests, last_request_at
  ) values (
    p_scope, p_client_hash, v_window, 1, now()
  )
  on conflict (scope, client_hash, window_start) do update
    set requests = private.site_financing_lead_rate_usage.requests + 1,
        last_request_at = now()
    where private.site_financing_lead_rate_usage.requests < p_limit
  returning requests into v_requests;

  return v_requests is not null and v_requests <= p_limit;
end;
$$;

revoke all on function private.site_financing_rate_take(text, text, integer, integer)
  from public, anon, authenticated, service_role;

-- O contrato público existente continua aceitando comprador/proprietário.
-- Financiamento passa exclusivamente pela Edge e pela RPC service-only abaixo.
drop policy if exists site_leads_insert_anon on public.site_leads;
create policy site_leads_insert_anon
on public.site_leads
for insert
to anon, authenticated
with check (
  char_length(trim(nome)) between 2 and 120
  and char_length(regexp_replace(telefone, '[^0-9]', '', 'g')) between 8 and 15
  and (email is null or char_length(email) between 3 and 254)
  and origem = 'site'
  and lead_type in ('comprador', 'proprietario')
  and not atendido
  and crm_lead_id is null
  and crm_negocio_id is null
  and crm_synced_at is null
  and crm_sync_error is null
  and jsonb_typeof(tracking) = 'object'
  and jsonb_typeof(context) = 'object'
  and octet_length(context::text) <= 8000
  and (context - array[
    'empreendimento_id', 'empreendimento_nome', 'unidade_id',
    'preferencia_horario', 'captacao_id', 'finalidade', 'bairro', 'cidade',
    'area_util', 'valor_imovel', 'percentual_financiado', 'valor_entrada',
    'valor_financiar', 'renda_mensal', 'estado_civil', 'objetivo',
    'tipo_imovel', 'source'
  ]::text[]) = '{}'::jsonb
  and (
    (unidade_id is null and not (context ? 'unidade_id'))
    or (
      unidade_id is not null
      and empreendimento_id is not null
      and context ->> 'unidade_id' = unidade_id::text
    )
  )
);

-- O endpoint acrescenta somente quatro chaves comerciais derivadas/normalizadas.
alter table public.site_leads
  drop constraint if exists site_leads_context_check;
alter table public.site_leads
  add constraint site_leads_context_check check (
    jsonb_typeof(context) = 'object'
    and octet_length(context::text) <= 8000
    and (context - array[
      'empreendimento_id', 'empreendimento_nome', 'unidade_id',
      'preferencia_horario', 'captacao_id', 'finalidade', 'bairro', 'cidade',
      'area_util', 'valor_imovel', 'percentual_financiado', 'valor_entrada',
      'valor_financiar', 'renda_mensal', 'estado_civil', 'objetivo',
      'tipo_imovel', 'source', 'item_id', 'item_codigo', 'item_name',
      'page_url'
    ]::text[]) = '{}'::jsonb
  );

create or replace function public.site_financing_lead_ingest(
  p_request_id uuid,
  p_payload_hash text,
  p_dedupe_hash text,
  p_ip_hash text,
  p_client_hash text,
  p_nome text,
  p_telefone text,
  p_email text,
  p_empreendimento_id uuid,
  p_unidade_id uuid,
  p_renda_mensal numeric,
  p_percentual_financiado integer,
  p_page_view_id uuid,
  p_tracking jsonb,
  p_page_url text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_existing private.site_financing_lead_receipts%rowtype;
  v_empreendimento_id uuid;
  v_empreendimento_nome text;
  v_item_id text;
  v_item_codigo text;
  v_item_name text;
  v_preco numeric;
  v_context jsonb;
  v_site_lead_id uuid;
begin
  if p_request_id is null
     or p_page_view_id is null
     or p_payload_hash is null
     or p_payload_hash !~ '^[0-9a-f]{64}$'
     or p_dedupe_hash is null
     or p_dedupe_hash !~ '^[0-9a-f]{64}$'
     or p_ip_hash is null
     or p_ip_hash !~ '^[0-9a-f]{64}$'
     or p_client_hash is null
     or p_client_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('accepted', false, 'code', 'invalid_request');
  end if;

  -- Serializa retries do mesmo request_id, inclusive quando um chamador tenta
  -- reutilizá-lo com conteúdo diferente.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('site-financing:request:' || p_request_id::text, 0)
  );

  select r.* into v_existing
  from private.site_financing_lead_receipts r
  where r.request_id = p_request_id;

  if found then
    if v_existing.payload_hash is distinct from p_payload_hash then
      return jsonb_build_object('accepted', false, 'code', 'idempotency_conflict');
    end if;
    return jsonb_build_object(
      'accepted', true,
      'duplicate', true,
      'request_id', p_request_id,
      'conversion_event_id', v_existing.conversion_event_id
    );
  end if;

  delete from private.site_financing_lead_rate_usage
  where window_start < now() - interval '48 hours';
  delete from private.site_financing_lead_receipts
  where created_at < now() - interval '30 days';

  if private.site_financing_rate_take('ip', p_ip_hash, 3600, 10) is not true
     or private.site_financing_rate_take('client', p_client_hash, 900, 3) is not true then
    return jsonb_build_object('accepted', false, 'code', 'rate_limited');
  end if;

  if char_length(btrim(coalesce(p_nome, ''))) not between 2 and 120
     or p_telefone is null
     or p_telefone !~ '^55[1-9][0-9]{9,10}$'
     or p_email is null
     or char_length(p_email) not between 3 and 254
     or p_email !~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or p_renda_mensal is null
     or p_renda_mensal not between 500 and 10000000
     or p_percentual_financiado is null
     or p_percentual_financiado not between 20 and 90
     or mod(p_percentual_financiado, 5) <> 0
     or p_empreendimento_id is null
     or p_page_url is null
     or p_page_url !~ '^https://(www[.])?apecerto[.]com/(?:[^?#[:cntrl:]]*)?$'
     or jsonb_typeof(p_tracking) is distinct from 'object'
     or octet_length(p_tracking::text) > 12000
     or p_tracking ->> 'page_view_id' is distinct from p_page_view_id::text
     or (p_tracking - array[
       'version', 'page_view_id', 'session_id', 'landing_path', 'current_path',
       'referrer_host', 'consent', 'identity', 'attribution'
     ]::text[]) <> '{}'::jsonb then
    return jsonb_build_object('accepted', false, 'code', 'invalid_request');
  end if;

  if p_unidade_id is not null then
    select
      e.id,
      e.nome,
      u.id::text,
      coalesce(nullif(btrim(u.codigo), ''), nullif(btrim(e.codigo), ''), u.id::text),
      e.nome || coalesce(
        ' · Unidade ' || nullif(btrim(coalesce(u.numero, u.codigo)), ''),
        ''
      ),
      coalesce(u.valor_promo, u.valor_tabela)
    into
      v_empreendimento_id,
      v_empreendimento_nome,
      v_item_id,
      v_item_codigo,
      v_item_name,
      v_preco
    from public.unidades u
    join public.empreendimentos e on e.id = u.empreendimento_id
    where u.id = p_unidade_id
      and e.id = p_empreendimento_id
      and u.publicado is true
      and u.disponivel is true
      and u.aprovacao is not distinct from 'aprovado'
      and e.publicado is true
      and e.rascunho is false
      and e.aprovacao is not distinct from 'aprovado';
  else
    select
      e.id,
      e.nome,
      e.id::text,
      coalesce(nullif(btrim(e.codigo), ''), e.id::text),
      e.nome,
      coalesce(
        e.preco,
        (
          select min(coalesce(u.valor_promo, u.valor_tabela))
          from public.unidades u
          where u.empreendimento_id = e.id
            and u.publicado is true
            and u.disponivel is true
            and u.aprovacao is not distinct from 'aprovado'
        )
      )
    into
      v_empreendimento_id,
      v_empreendimento_nome,
      v_item_id,
      v_item_codigo,
      v_item_name,
      v_preco
    from public.empreendimentos e
    where e.id = p_empreendimento_id
      and e.publicado is true
      and e.rascunho is false
      and e.aprovacao is not distinct from 'aprovado';
  end if;

  if not found or v_preco is null or v_preco <= 0 then
    return jsonb_build_object('accepted', false, 'code', 'target_not_available');
  end if;

  -- A trava pelo hash elimina a corrida entre request_ids distintos. A busca
  -- relativa a now(), e não um bucket fixo, cobre corretamente a virada de
  -- qualquer meia hora.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('site-financing:dedupe:' || p_dedupe_hash, 0)
  );

  select r.* into v_existing
  from private.site_financing_lead_receipts r
  where r.dedupe_hash = p_dedupe_hash
    and r.created_at >= clock_timestamp() - interval '30 minutes'
    and r.site_lead_id is not null
  order by r.created_at desc, r.completed_at desc nulls last
  limit 1;

  if found then
    -- Guarda também o request atual para que seus retries futuros sejam
    -- idempotentes, sem estender a janela comercial do lead original.
    insert into private.site_financing_lead_receipts (
      request_id, conversion_event_id, payload_hash, dedupe_hash,
      site_lead_id, created_at, completed_at
    ) values (
      p_request_id, v_existing.conversion_event_id, p_payload_hash,
      p_dedupe_hash, v_existing.site_lead_id, v_existing.created_at, now()
    );
    return jsonb_build_object(
      'accepted', true,
      'duplicate', true,
      'request_id', p_request_id,
      'conversion_event_id', v_existing.conversion_event_id
    );
  end if;

  insert into private.site_financing_lead_receipts (
    request_id, conversion_event_id, payload_hash, dedupe_hash
  ) values (
    p_request_id, p_request_id, p_payload_hash, p_dedupe_hash
  );

  v_context := jsonb_strip_nulls(jsonb_build_object(
    'empreendimento_id', v_empreendimento_id,
    'empreendimento_nome', v_empreendimento_nome,
    'unidade_id', p_unidade_id,
    'valor_imovel', round(v_preco, 2),
    'percentual_financiado', p_percentual_financiado,
    'valor_entrada', round(v_preco * (100 - p_percentual_financiado) / 100, 2),
    'valor_financiar', round(v_preco * p_percentual_financiado / 100, 2),
    'renda_mensal', round(p_renda_mensal, 2),
    'source', 'finance_simulator',
    'item_id', v_item_id,
    'item_codigo', v_item_codigo,
    'item_name', v_item_name,
    'page_url', p_page_url
  ));

  insert into public.site_leads (
    nome,
    telefone,
    email,
    origem,
    lead_type,
    empreendimento_id,
    unidade_id,
    empreendimento_nome,
    page_view_id,
    tracking,
    context
  ) values (
    btrim(p_nome),
    p_telefone,
    lower(btrim(p_email)),
    'site_financiamento',
    'financiamento',
    v_empreendimento_id,
    p_unidade_id,
    v_empreendimento_nome,
    p_page_view_id,
    p_tracking,
    v_context
  ) returning id into v_site_lead_id;

  update private.site_financing_lead_receipts
  set site_lead_id = v_site_lead_id,
      completed_at = now()
  where request_id = p_request_id;

  return jsonb_build_object(
    'accepted', true,
    'duplicate', false,
    'request_id', p_request_id,
    'conversion_event_id', p_request_id
  );
exception when check_violation or foreign_key_violation or invalid_text_representation then
  return jsonb_build_object('accepted', false, 'code', 'invalid_request');
end;
$$;

revoke all on function public.site_financing_lead_ingest(
  uuid, text, text, text, text, text, text, text, uuid, uuid,
  numeric, integer, uuid, jsonb, text
) from public, anon, authenticated;
grant execute on function public.site_financing_lead_ingest(
  uuid, text, text, text, text, text, text, text, uuid, uuid,
  numeric, integer, uuid, jsonb, text
) to service_role;

comment on function public.site_financing_lead_ingest(
  uuid, text, text, text, text, text, text, text, uuid, uuid,
  numeric, integer, uuid, jsonb, text
) is 'Ingest transacional service-only do financiamento público; sem segredo no navegador.';

-- A conversão final usa o request_id estável. O índice impede duplicidade
-- first-party mesmo se o navegador repetir generate_lead após a resposta.
create unique index if not exists site_events_generate_lead_event_id_uidx
  on private.site_events_anon ((properties ->> 'event_id'))
  where event_name = 'generate_lead'
    and nullif(properties ->> 'event_id', '') is not null;

create or replace function public.site_event_ingest_v2(
  p_client_hash text,
  p_page_view_id uuid,
  p_session_id uuid default null,
  p_event_name text default null,
  p_page_path text default '/',
  p_referrer_host text default null,
  p_device_category text default 'unknown',
  p_consent_level text default 'essential',
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_properties jsonb default '{}'::jsonb,
  p_limit integer default 300
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := date_trunc('hour', now());
  v_requests integer;
begin
  if p_client_hash is null or char_length(p_client_hash) <> 64 then
    return false;
  end if;

  delete from private.site_event_rate_usage
  where window_start < now() - interval '48 hours';

  insert into private.site_event_rate_usage (client_hash, window_start, requests, last_request_at)
  values (p_client_hash, v_window, 1, now())
  on conflict (client_hash, window_start) do update
    set requests = private.site_event_rate_usage.requests + 1,
        last_request_at = now()
    where private.site_event_rate_usage.requests < greatest(10, least(p_limit, 1000))
  returning requests into v_requests;

  if v_requests is null or v_requests > greatest(10, least(p_limit, 1000)) then
    return false;
  end if;

  insert into private.site_events_anon (
    page_view_id, session_id, event_name, page_path, referrer_host,
    device_category, consent_level, utm_source, utm_medium, utm_campaign,
    properties
  ) values (
    p_page_view_id,
    case when p_consent_level = 'essential' then null else p_session_id end,
    p_event_name, p_page_path, nullif(p_referrer_host, ''),
    p_device_category, p_consent_level, nullif(p_utm_source, ''),
    nullif(p_utm_medium, ''), nullif(p_utm_campaign, ''),
    coalesce(p_properties, '{}'::jsonb)
  )
  on conflict do nothing;

  return true;
exception when check_violation or invalid_text_representation then
  return false;
end;
$$;

revoke all on function public.site_event_ingest_v2(
  text, uuid, uuid, text, text, text, text, text, text, text, text, jsonb, integer
) from public, anon, authenticated;
grant execute on function public.site_event_ingest_v2(
  text, uuid, uuid, text, text, text, text, text, text, text, text, jsonb, integer
) to service_role;

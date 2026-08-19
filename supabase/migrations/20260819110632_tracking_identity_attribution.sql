-- Tracking 360 / Fase 1
-- Identidade consentida de sessao + first/last touch normalizados por lead.

alter table private.site_events_anon
  add column if not exists session_id uuid;

create index if not exists site_events_anon_session_idx
  on private.site_events_anon (session_id, occurred_at)
  where session_id is not null;

comment on column private.site_events_anon.session_id is
  'Identificador efemero por aba/sessao, gravado somente com consentimento analytics ou marketing.';

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
  );

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

create table if not exists private.lead_attribution (
  lead_id bigint primary key references public.leads(id) on delete cascade,
  first_touch jsonb not null default '{}'::jsonb,
  last_touch jsonb not null default '{}'::jsonb,
  last_site_lead_id uuid references public.site_leads(id) on delete set null,
  last_page_view_id uuid,
  last_session_id uuid,
  ga_client_id text,
  ga_session_id text,
  source text,
  medium text,
  campaign text,
  campaign_id text,
  adset_id text,
  ad_group_id text,
  ad_id text,
  creative_id text,
  utm_content text,
  utm_term text,
  gclid text,
  gbraid text,
  wbraid text,
  fbclid text,
  fbp text,
  fbc text,
  landing_path text,
  referrer_host text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_attribution_first_touch_check check (
    jsonb_typeof(first_touch) = 'object' and octet_length(first_touch::text) <= 12000
  ),
  constraint lead_attribution_last_touch_check check (
    jsonb_typeof(last_touch) = 'object' and octet_length(last_touch::text) <= 12000
  )
);

create index if not exists lead_attribution_campaign_idx
  on private.lead_attribution (source, medium, campaign, last_seen_at desc);
create index if not exists lead_attribution_google_click_idx
  on private.lead_attribution (gclid) where gclid is not null;
create index if not exists lead_attribution_meta_click_idx
  on private.lead_attribution (fbclid) where fbclid is not null;

alter table private.lead_attribution enable row level security;
revoke all on table private.lead_attribution from public, anon, authenticated;
grant select, insert, update, delete on table private.lead_attribution to service_role;

drop policy if exists lead_attribution_service_role_all on private.lead_attribution;
create policy lead_attribution_service_role_all
on private.lead_attribution
for all
to service_role
using (true)
with check (true);

comment on table private.lead_attribution is
  'Atribuicao first/last touch vinculada ao leads.id, source of truth comercial da ApeCerto.';

create or replace function public.site_lead_sync_crm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(new.telefone, ''), '[^0-9]', '', 'g');
  v_first_touch jsonb := coalesce(new.tracking #> '{attribution,first}', '{}'::jsonb);
  v_last_touch jsonb := coalesce(
    new.tracking #> '{attribution,last}',
    new.tracking #> '{attribution,current}',
    new.tracking #> '{attribution,first}',
    '{}'::jsonb
  );
  v_identity jsonb := coalesce(new.tracking -> 'identity', '{}'::jsonb);
  v_origin text;
  v_pipeline_id bigint;
  v_stage_id bigint;
  v_lead_id bigint;
  v_negocio_id bigint;
  v_session_text text;
  v_session_id uuid;
  v_first_seen_at timestamptz := now();
begin
  if jsonb_typeof(v_first_touch) <> 'object' then v_first_touch := '{}'::jsonb; end if;
  if jsonb_typeof(v_last_touch) <> 'object' then v_last_touch := '{}'::jsonb; end if;
  if jsonb_typeof(v_identity) <> 'object' then v_identity := '{}'::jsonb; end if;

  v_origin := coalesce(
    nullif(v_last_touch ->> 'utm_source', ''),
    case when nullif(v_last_touch ->> 'gclid', '') is not null then 'google' end,
    case when nullif(v_last_touch ->> 'fbclid', '') is not null then 'meta' end,
    'site'
  );

  v_session_text := nullif(v_identity ->> 'session_id', '');
  if v_session_text ~* '^[0-9a-f]{8}-[0-9a-f-]{27}$' then
    v_session_id := v_session_text::uuid;
  end if;

  begin
    if nullif(v_first_touch ->> 'captured_at', '') is not null then
      v_first_seen_at := (v_first_touch ->> 'captured_at')::timestamptz;
    end if;
  exception when invalid_datetime_format or datetime_field_overflow then
    v_first_seen_at := now();
  end;

  select p.id into v_pipeline_id
  from public.pipelines p
  where lower(trim(p.nome)) = lower('Funil 2.0')
  order by p.id desc
  limit 1;

  select l.id into v_lead_id
  from public.leads l
  where regexp_replace(coalesce(l.telefone, ''), '[^0-9]', '', 'g') = v_phone
  order by l.id desc
  limit 1;

  if v_lead_id is null then
    insert into public.leads (nome, telefone, email, pipeline_id, status, origem, extras)
    values (
      new.nome, v_phone, nullif(new.email, ''), v_pipeline_id, 'novo', v_origin,
      jsonb_build_object(
        'site_last_lead_id', new.id,
        'site_first_touch', v_first_touch,
        'site_last_touch', v_last_touch,
        'site_tracking_identity', v_identity,
        'site_empreendimento_id', new.empreendimento_id,
        'site_empreendimento_nome', new.empreendimento_nome,
        'site_preferencia_horario', new.preferencia_horario
      )
    )
    returning id into v_lead_id;
  else
    update public.leads
    set nome = coalesce(nullif(new.nome, ''), nome),
        email = coalesce(email, nullif(new.email, '')),
        atualizado_em = now(),
        extras = coalesce(extras, '{}'::jsonb) || jsonb_build_object(
          'site_last_lead_id', new.id,
          'site_first_touch', coalesce(extras -> 'site_first_touch', v_first_touch),
          'site_last_touch', v_last_touch,
          'site_tracking_identity', v_identity,
          'site_empreendimento_id', new.empreendimento_id,
          'site_empreendimento_nome', new.empreendimento_nome,
          'site_preferencia_horario', new.preferencia_horario
        )
    where id = v_lead_id;
  end if;

  insert into private.lead_attribution (
    lead_id, first_touch, last_touch, last_site_lead_id, last_page_view_id,
    last_session_id, ga_client_id, ga_session_id, source, medium, campaign,
    campaign_id, adset_id, ad_group_id, ad_id, creative_id, utm_content,
    utm_term, gclid, gbraid, wbraid, fbclid, fbp, fbc, landing_path,
    referrer_host, first_seen_at, last_seen_at, updated_at
  ) values (
    v_lead_id, v_first_touch, v_last_touch, new.id, new.page_view_id,
    v_session_id, left(nullif(v_identity ->> 'ga_client_id', ''), 120),
    left(nullif(v_identity ->> 'ga_session_id', ''), 120), v_origin,
    left(nullif(v_last_touch ->> 'utm_medium', ''), 120),
    left(nullif(v_last_touch ->> 'utm_campaign', ''), 200),
    left(nullif(v_last_touch ->> 'campaign_id', ''), 200),
    left(nullif(v_last_touch ->> 'adset_id', ''), 200),
    left(nullif(v_last_touch ->> 'ad_group_id', ''), 200),
    left(nullif(v_last_touch ->> 'ad_id', ''), 200),
    left(nullif(v_last_touch ->> 'creative_id', ''), 200),
    left(nullif(v_last_touch ->> 'utm_content', ''), 200),
    left(nullif(v_last_touch ->> 'utm_term', ''), 200),
    left(nullif(v_last_touch ->> 'gclid', ''), 500),
    left(nullif(v_last_touch ->> 'gbraid', ''), 500),
    left(nullif(v_last_touch ->> 'wbraid', ''), 500),
    left(nullif(v_last_touch ->> 'fbclid', ''), 500),
    left(nullif(v_identity ->> 'fbp', ''), 500),
    left(nullif(v_identity ->> 'fbc', ''), 500),
    left(coalesce(nullif(v_first_touch ->> 'landing_path', ''), new.tracking ->> 'landing_path'), 500),
    left(coalesce(nullif(v_first_touch ->> 'referrer_host', ''), new.tracking ->> 'referrer_host'), 200),
    v_first_seen_at,
    now(), now()
  )
  on conflict (lead_id) do update
  set first_touch = case
        when private.lead_attribution.first_touch = '{}'::jsonb then excluded.first_touch
        else private.lead_attribution.first_touch
      end,
      last_touch = excluded.last_touch,
      last_site_lead_id = excluded.last_site_lead_id,
      last_page_view_id = excluded.last_page_view_id,
      last_session_id = excluded.last_session_id,
      ga_client_id = coalesce(excluded.ga_client_id, private.lead_attribution.ga_client_id),
      ga_session_id = coalesce(excluded.ga_session_id, private.lead_attribution.ga_session_id),
      source = excluded.source,
      medium = excluded.medium,
      campaign = excluded.campaign,
      campaign_id = excluded.campaign_id,
      adset_id = excluded.adset_id,
      ad_group_id = excluded.ad_group_id,
      ad_id = excluded.ad_id,
      creative_id = excluded.creative_id,
      utm_content = excluded.utm_content,
      utm_term = excluded.utm_term,
      gclid = coalesce(excluded.gclid, private.lead_attribution.gclid),
      gbraid = coalesce(excluded.gbraid, private.lead_attribution.gbraid),
      wbraid = coalesce(excluded.wbraid, private.lead_attribution.wbraid),
      fbclid = coalesce(excluded.fbclid, private.lead_attribution.fbclid),
      fbp = coalesce(excluded.fbp, private.lead_attribution.fbp),
      fbc = coalesce(excluded.fbc, private.lead_attribution.fbc),
      landing_path = coalesce(private.lead_attribution.landing_path, excluded.landing_path),
      referrer_host = coalesce(private.lead_attribution.referrer_host, excluded.referrer_host),
      last_seen_at = now(),
      updated_at = now();

  if v_pipeline_id is not null then
    select n.id into v_negocio_id
    from public.negocios n
    where n.lead_id = v_lead_id
      and n.pipeline_id = v_pipeline_id
      and n.status = 'aberto'
    order by n.id desc
    limit 1;

    if v_negocio_id is null then
      select ps.id into v_stage_id
      from public.pipeline_stages ps
      where ps.pipeline_id = v_pipeline_id
      order by ps.ordem nulls last, ps.id
      limit 1;

      insert into public.negocios (
        lead_id, pipeline_id, stage_id, empreendimento_id, status,
        ultima_movimentacao, raw
      ) values (
        v_lead_id, v_pipeline_id, v_stage_id, new.empreendimento_id, 'aberto',
        now(), jsonb_build_object(
          'origem', 'site',
          'site_lead_id', new.id,
          'tracking_first_touch', v_first_touch,
          'tracking_last_touch', v_last_touch,
          'tracking_identity', v_identity
        )
      )
      returning id into v_negocio_id;
    else
      update public.negocios
      set empreendimento_id = coalesce(empreendimento_id, new.empreendimento_id),
          ultima_movimentacao = now(),
          raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
            'site_last_lead_id', new.id,
            'tracking_first_touch', coalesce(raw -> 'tracking_first_touch', v_first_touch),
            'tracking_last_touch', v_last_touch,
            'tracking_identity', v_identity
          )
      where id = v_negocio_id;
    end if;

    begin
      perform public.f2_entrada_direta(v_negocio_id, 'novo');
    exception when others then
      null;
    end;
  end if;

  update public.site_leads
  set crm_lead_id = v_lead_id,
      crm_negocio_id = v_negocio_id,
      crm_synced_at = now(),
      crm_sync_error = null
  where id = new.id;

  return new;
exception when others then
  update public.site_leads
  set crm_sync_error = left(sqlstate || ': ' || sqlerrm, 240)
  where id = new.id;
  return new;
end;
$$;

revoke all on function public.site_lead_sync_crm() from public, anon, authenticated;
grant execute on function public.site_lead_sync_crm() to service_role;

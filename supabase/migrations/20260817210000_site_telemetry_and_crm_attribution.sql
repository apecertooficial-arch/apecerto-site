create table if not exists private.site_events_anon (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  page_view_id uuid not null,
  event_name text not null,
  page_path text not null,
  referrer_host text,
  device_category text not null default 'unknown',
  consent_level text not null default 'essential',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  properties jsonb not null default '{}'::jsonb,
  constraint site_events_event_name_check check (event_name = any (array[
    'page_view', 'consent_update', 'view_item', 'view_inventory',
    'generate_lead', 'whatsapp_click', 'phone_click', 'social_click',
    'sara_open', 'sara_search', 'sara_results', 'sara_error',
    'favorite_toggle', 'gallery_interaction', 'property_search',
    'cta_click', 'owner_cta_click', 'form_start', 'filter_change',
    'scroll_depth'
  ])),
  constraint site_events_page_path_check check (
    char_length(page_path) between 1 and 240
    and position('?' in page_path) = 0
    and position('#' in page_path) = 0
  ),
  constraint site_events_referrer_check check (referrer_host is null or char_length(referrer_host) <= 160),
  constraint site_events_device_check check (device_category = any (array['mobile', 'tablet', 'desktop', 'unknown'])),
  constraint site_events_consent_check check (consent_level = any (array['essential', 'analytics', 'marketing'])),
  constraint site_events_properties_check check (
    jsonb_typeof(properties) = 'object'
    and octet_length(properties::text) <= 4000
  )
);

create index if not exists site_events_anon_occurred_at_idx
  on private.site_events_anon (occurred_at desc);
create index if not exists site_events_anon_page_view_idx
  on private.site_events_anon (page_view_id, occurred_at);
create index if not exists site_events_anon_event_day_idx
  on private.site_events_anon (event_name, occurred_at desc);

alter table private.site_events_anon enable row level security;
revoke all on table private.site_events_anon from public, anon, authenticated;

create table if not exists private.site_event_rate_usage (
  client_hash text not null,
  window_start timestamptz not null,
  requests integer not null default 1 check (requests > 0),
  last_request_at timestamptz not null default now(),
  primary key (client_hash, window_start)
);

alter table private.site_event_rate_usage enable row level security;
revoke all on table private.site_event_rate_usage from public, anon, authenticated;

create or replace function public.site_event_ingest(
  p_client_hash text,
  p_page_view_id uuid,
  p_event_name text,
  p_page_path text,
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
    page_view_id, event_name, page_path, referrer_host, device_category,
    consent_level, utm_source, utm_medium, utm_campaign, properties
  ) values (
    p_page_view_id, p_event_name, p_page_path, nullif(p_referrer_host, ''), p_device_category,
    p_consent_level, nullif(p_utm_source, ''), nullif(p_utm_medium, ''),
    nullif(p_utm_campaign, ''), coalesce(p_properties, '{}'::jsonb)
  );

  return true;
exception when check_violation or invalid_text_representation then
  return false;
end;
$$;

revoke all on function public.site_event_ingest(
  text, uuid, text, text, text, text, text, text, text, text, jsonb, integer
) from public, anon, authenticated;
grant execute on function public.site_event_ingest(
  text, uuid, text, text, text, text, text, text, text, text, jsonb, integer
) to service_role;

comment on table private.site_events_anon is
  'Telemetria first-party sem cookie e sem identificador persistente. page_view_id vive somente durante uma pagina aberta.';
comment on table private.site_event_rate_usage is
  'Hash tecnico temporario usado somente para limitar abuso; retencao maxima de 48 horas.';

alter table public.site_leads add column if not exists email text;
alter table public.site_leads add column if not exists page_view_id uuid;
alter table public.site_leads add column if not exists tracking jsonb not null default '{}'::jsonb;
alter table public.site_leads add column if not exists crm_lead_id bigint;
alter table public.site_leads add column if not exists crm_negocio_id bigint;
alter table public.site_leads add column if not exists crm_synced_at timestamptz;
alter table public.site_leads add column if not exists crm_sync_error text;
alter table public.captacoes_portal add column if not exists page_view_id uuid;
alter table public.captacoes_portal add column if not exists tracking jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'site_leads_tracking_check') then
    alter table public.site_leads add constraint site_leads_tracking_check check (
      jsonb_typeof(tracking) = 'object' and octet_length(tracking::text) <= 12000
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'site_leads_crm_lead_fkey') then
    alter table public.site_leads add constraint site_leads_crm_lead_fkey
      foreign key (crm_lead_id) references public.leads(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'site_leads_crm_negocio_fkey') then
    alter table public.site_leads add constraint site_leads_crm_negocio_fkey
      foreign key (crm_negocio_id) references public.negocios(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'captacoes_portal_tracking_check') then
    alter table public.captacoes_portal add constraint captacoes_portal_tracking_check check (
      jsonb_typeof(tracking) = 'object' and octet_length(tracking::text) <= 12000
    );
  end if;
end
$$;

create index if not exists site_leads_page_view_idx on public.site_leads (page_view_id);
create index if not exists site_leads_crm_lead_idx on public.site_leads (crm_lead_id);
create index if not exists site_leads_crm_negocio_idx on public.site_leads (crm_negocio_id);
create index if not exists captacoes_portal_page_view_idx on public.captacoes_portal (page_view_id);

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
  and not atendido
  and crm_lead_id is null
  and crm_negocio_id is null
  and crm_synced_at is null
  and crm_sync_error is null
  and jsonb_typeof(tracking) = 'object'
);

revoke all on table public.site_leads from anon, authenticated;
grant insert on table public.site_leads to anon;
grant select, insert, update on table public.site_leads to authenticated;

create or replace function public.site_lead_sync_crm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(new.telefone, ''), '[^0-9]', '', 'g');
  v_origin text := coalesce(nullif(new.tracking #>> '{attribution,current,utm_source}', ''), 'site');
  v_pipeline_id bigint;
  v_stage_id bigint;
  v_lead_id bigint;
  v_negocio_id bigint;
begin
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
        'site_last_touch', new.tracking,
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
          'site_last_touch', new.tracking,
          'site_empreendimento_id', new.empreendimento_id,
          'site_empreendimento_nome', new.empreendimento_nome,
          'site_preferencia_horario', new.preferencia_horario
        )
    where id = v_lead_id;
  end if;

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
        now(), jsonb_build_object('origem', 'site', 'site_lead_id', new.id, 'tracking', new.tracking)
      )
      returning id into v_negocio_id;
    else
      update public.negocios
      set empreendimento_id = coalesce(empreendimento_id, new.empreendimento_id),
          ultima_movimentacao = now(),
          raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
            'site_last_lead_id', new.id,
            'site_last_touch', new.tracking
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

drop trigger if exists trg_site_lead_sync_crm on public.site_leads;
create trigger trg_site_lead_sync_crm
after insert on public.site_leads
for each row execute function public.site_lead_sync_crm();

create or replace function public.site_telemetry_summary(p_days integer default 30)
returns table (
  day date,
  event_name text,
  page_path text,
  utm_source text,
  utm_campaign text,
  events bigint,
  page_views bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_equipe() or auth.role() = 'service_role') then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;

  return query
  select
    timezone('America/Sao_Paulo', e.occurred_at)::date,
    e.event_name,
    e.page_path,
    e.utm_source,
    e.utm_campaign,
    count(*)::bigint,
    count(distinct e.page_view_id)::bigint
  from private.site_events_anon e
  where e.occurred_at >= now() - make_interval(days => greatest(1, least(p_days, 365)))
  group by 1, 2, 3, 4, 5
  order by 1 desc, 6 desc;
end;
$$;

revoke all on function public.site_telemetry_summary(integer) from public, anon;
grant execute on function public.site_telemetry_summary(integer) to authenticated, service_role;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in select jobid from cron.job where jobname = 'apecerto-site-telemetry-retention'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'apecerto-site-telemetry-retention',
    '17 3 * * *',
    $retention$
      delete from private.site_events_anon where occurred_at < now() - interval '90 days';
      delete from private.site_event_rate_usage where window_start < now() - interval '48 hours';
    $retention$
  );
end
$$;

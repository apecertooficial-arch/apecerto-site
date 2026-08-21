-- Fecha o Tracking 360 sem reintroduzir escrita implícita de atribuição.
-- private.lead_attribution continua sendo escrita exclusivamente pelo módulo
-- explícito sync-meta-attribution-field-operation da Central de Automações.

drop function if exists public.tracking_set_meta_lead_id(bigint, text);

create or replace function private.enqueue_meta_crm_event(
  p_event_type text,
  p_source_table text,
  p_source_id text,
  p_negocio_id bigint,
  p_event_time timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery_id uuid;
  v_event_id text := p_event_type || '-' || p_source_id;
begin
  if p_event_type not in ('responded','qualification_started','qualified','visit_scheduled','visit','proposal','purchase')
     or coalesce(p_source_table, '') = ''
     or coalesce(p_source_id, '') = ''
     or p_negocio_id is null then
    return null;
  end if;

  insert into private.tracking_delivery_logs
    (channel,event_id,event_type,source_table,source_id,negocio_id,payload)
  values
    ('meta_crm',v_event_id,p_event_type,p_source_table,p_source_id,p_negocio_id,
     jsonb_build_object(
       'event_type',p_event_type,
       'source_table',p_source_table,
       'source_id',p_source_id,
       'negocio_id',p_negocio_id,
       'event_time',coalesce(p_event_time, now())
     ))
  on conflict (channel,event_id) do nothing
  returning id into v_delivery_id;

  if v_delivery_id is not null then
    perform private.dispatch_tracking_delivery(v_delivery_id);
  end if;
  return v_delivery_id;
end;
$$;

revoke all on function private.enqueue_meta_crm_event(text,text,text,bigint,timestamptz)
  from public, anon, authenticated;

create or replace function public.tracking_lead_attribution(p_lead_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_strip_nulls(jsonb_build_object(
      'meta_lead_id', a.meta_lead_id,
      'first_touch', a.first_touch,
      'last_touch', a.last_touch,
      'fbp', a.fbp,
      'fbc', a.fbc,
      'landing_path', a.landing_path,
      'referrer_host', a.referrer_host,
      'campaign', a.campaign,
      'campaign_id', a.campaign_id,
      'adset_id', a.adset_id,
      'adset_name', a.last_touch ->> 'adset',
      'ad_id', a.ad_id,
      'ad_name', a.last_touch ->> 'ad',
      'creative_id', a.creative_id,
      'form_id', a.last_touch ->> 'form_id',
      'page_id', a.last_touch ->> 'page_id',
      'platform', a.last_touch ->> 'platform',
      'is_organic', a.last_touch ->> 'is_organic',
      'meta_created_time', a.last_touch ->> 'created_time',
      'source', a.source,
      'medium', a.medium
    ))
    from private.lead_attribution a
    where a.lead_id = p_lead_id
  ), '{}'::jsonb);
$$;

revoke all on function public.tracking_lead_attribution(bigint)
  from public, anon, authenticated;
grant execute on function public.tracking_lead_attribution(bigint)
  to service_role;

comment on function public.tracking_lead_attribution(bigint) is
  'Leitor service_role da atribuição canônica produzida pela operação explícita da Central.';

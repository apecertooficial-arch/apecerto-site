-- Painel executivo de tracking: somente agregados, sem PII e sem escritor implícito.
-- A função é SECURITY DEFINER para ler o schema private, mas valida o papel do
-- usuário antes de produzir qualquer dado.

create or replace function public.tracking_360_dashboard(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 365));
  v_since timestamptz;
  v_role text;
  v_result jsonb;
begin
  select u.role into v_role
  from public.usuarios u
  where u.id = auth.uid() and coalesce(u.ativo, true)
  limit 1;

  if v_role is null or v_role not in ('admin','gestor','executivo','gestor_comercial','gestor_equipe','diretor') then
    raise exception 'tracking_360_forbidden' using errcode = '42501';
  end if;

  v_since := now() - make_interval(days => v_days);

  with
  site as (
    select * from private.site_events_anon where occurred_at >= v_since
  ),
  site_kpis as (
    select
      count(distinct page_view_id) filter (where event_name = 'page_view')::bigint as page_views,
      count(distinct session_id) filter (where session_id is not null)::bigint as sessions,
      count(*) filter (where event_name = 'view_item')::bigint as property_views,
      count(*) filter (where event_name = 'gallery_interaction')::bigint as gallery_interactions,
      count(*) filter (where event_name = 'whatsapp_click')::bigint as whatsapp_clicks,
      count(*) filter (where event_name = 'phone_click')::bigint as phone_clicks,
      count(*) filter (where event_name = 'form_start')::bigint as form_starts,
      count(*) filter (where event_name = 'form_submit_attempt')::bigint as form_attempts,
      count(*) filter (where event_name = 'form_error')::bigint as form_errors,
      count(*) filter (where event_name = 'generate_lead')::bigint as site_leads,
      count(*) filter (where event_name = 'owner_cta_click')::bigint as owner_intents,
      count(*) filter (where event_name = 'generate_lead' and properties->>'lead_type' = 'proprietario')::bigint as owner_leads,
      round(avg(nullif(properties->>'engagement_seconds','')::numeric)
        filter (where event_name in ('engagement_time','page_exit')), 1) as avg_engagement_seconds,
      max(occurred_at) as last_site_event_at
    from site
  ),
  consent as (
    select coalesce(jsonb_object_agg(consent_level, total order by consent_level), '{}'::jsonb) data
    from (select consent_level, count(distinct page_view_id)::bigint total from site where event_name='page_view' group by consent_level) x
  ),
  top_pages as (
    select coalesce(jsonb_agg(jsonb_build_object('path',page_path,'views',views) order by views desc), '[]'::jsonb) data
    from (
      select page_path, count(distinct page_view_id)::bigint views
      from site where event_name='page_view'
      group by page_path order by views desc limit 10
    ) x
  ),
  crm_period as (
    select l.* from public.leads l where l.criado_em >= v_since
  ),
  crm_kpis as (
    select
      count(*)::bigint as leads,
      count(*) filter (where l.atendido_em is not null)::bigint as attended,
      count(*) filter (where a.lead_id is not null)::bigint as attributed,
      count(*) filter (where a.meta_lead_id is not null)::bigint as meta_attributed,
      count(*) filter (where a.campaign_id is not null)::bigint as campaign_identified,
      round(100.0 * count(*) filter (where a.lead_id is not null) / nullif(count(*),0), 1) as attribution_coverage
    from crm_period l
    left join private.lead_attribution a on a.lead_id=l.id
  ),
  crm_moments as (
    select coalesce(jsonb_agg(jsonb_build_object('moment',moment,'total',total) order by total desc), '[]'::jsonb) data
    from (
      select coalesce(nullif(l.momento_atual,''),nullif(l.momento,''),'sem_momento') moment, count(*)::bigint total
      from crm_period l group by 1 order by 2 desc limit 12
    ) x
  ),
  meta_rows as (
    select * from private.tracking_delivery_logs
    where channel='meta_crm' and created_at >= v_since
  ),
  meta_kpis as (
    select
      count(*)::bigint as total,
      count(*) filter (where status='delivered')::bigint as delivered,
      count(*) filter (where status in ('pending','dispatched','sending'))::bigint as processing,
      count(*) filter (where status in ('failed','blocked'))::bigint as errors,
      count(*) filter (where status='skipped')::bigint as skipped,
      max(delivered_at) as last_delivery_at
    from meta_rows
  ),
  meta_events as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'event_type',event_type,'total',total,'delivered',delivered,'errors',errors
    ) order by total desc), '[]'::jsonb) data
    from (
      select event_type, count(*)::bigint total,
        count(*) filter (where status='delivered')::bigint delivered,
        count(*) filter (where status in ('failed','blocked'))::bigint errors
      from meta_rows group by event_type
    ) x
  ),
  campaigns as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'campaign',campaign,'campaign_id',campaign_id,'leads',leads,'responded',responded,'qualified',qualified
    ) order by leads desc), '[]'::jsonb) data
    from (
      select coalesce(nullif(a.campaign,''),'Campanha não identificada') campaign,
        a.campaign_id, count(distinct l.id)::bigint leads,
        count(distinct l.id) filter (where d.event_type='responded' and d.status='delivered')::bigint responded,
        count(distinct l.id) filter (where d.event_type='qualified' and d.status='delivered')::bigint qualified
      from crm_period l
      left join private.lead_attribution a on a.lead_id=l.id
      left join public.negocios n on n.lead_id=l.id
      left join private.tracking_delivery_logs d on d.negocio_id=n.id and d.channel='meta_crm'
      group by a.campaign,a.campaign_id order by count(distinct l.id) desc limit 12
    ) x
  )
  select jsonb_build_object(
    'generated_at', now(),
    'period_days', v_days,
    'site', to_jsonb(site_kpis),
    'consent', consent.data,
    'top_pages', top_pages.data,
    'crm', to_jsonb(crm_kpis),
    'crm_moments', crm_moments.data,
    'meta', to_jsonb(meta_kpis),
    'meta_events', meta_events.data,
    'campaigns', campaigns.data
  ) into v_result
  from site_kpis, consent, top_pages, crm_kpis, crm_moments, meta_kpis, meta_events, campaigns;

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.tracking_360_dashboard(integer) from public, anon;
grant execute on function public.tracking_360_dashboard(integer) to authenticated;

comment on function public.tracking_360_dashboard(integer) is
  'Resumo executivo sem PII do tracking do site, atribuição CRM e entregas Meta. Leitura para gestores autenticados.';

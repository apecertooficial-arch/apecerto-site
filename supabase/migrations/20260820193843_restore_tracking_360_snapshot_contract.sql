-- Restaura o contrato agregado removido por uma limpeza posterior no ERP.
-- A funcao nao retorna PII e so pode ser executada pela equipe autenticada
-- ou pela service role usada por integracoes de servidor.

create or replace function public.tracking_360_snapshot(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 365));
  v_since timestamptz;
  v_result jsonb;
begin
  if not (
    public.is_equipe()
    or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
  ) then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;

  v_since := now() - make_interval(days => v_days);

  with events as (
    select e.*
    from private.site_events_anon e
    where e.occurred_at >= v_since
  ),
  per_view as (
    select
      page_view_id,
      max(occurred_at) as last_event_at,
      max(case when event_name = 'engagement_time'
        then coalesce((properties ->> 'engagement_seconds')::integer, 0) else 0 end) as engaged_seconds,
      bool_or(event_name = 'view_item') as viewed_property,
      bool_or(event_name = 'gallery_interaction') as used_gallery,
      bool_or(event_name = 'form_start') as started_form,
      bool_or(event_name = 'form_submit_attempt') as attempted_form,
      bool_or(event_name = 'generate_lead') as generated_lead,
      bool_or(event_name = 'whatsapp_click') as clicked_whatsapp,
      bool_or(event_name = 'schedule_start') as started_schedule,
      bool_or(event_name = 'schedule_complete') as completed_schedule
    from events
    group by page_view_id
  ),
  funnel as (
    select jsonb_object_agg(event_name, total order by event_name) as data
    from (
      select event_name, count(distinct page_view_id)::bigint as total
      from events
      where event_name = any (array[
        'page_view','view_item','gallery_interaction','favorite_toggle',
        'whatsapp_click','phone_click','owner_cta_click','form_start',
        'form_submit_attempt','generate_lead','schedule_start','schedule_complete',
        'financing_open','sara_search','sara_results'
      ])
      group by event_name
    ) f
  ),
  event_totals as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'event_name', event_name,
      'events', events,
      'page_views', page_views
    ) order by events desc, event_name), '[]'::jsonb) as data
    from (
      select event_name, count(*)::bigint as events,
        count(distinct page_view_id)::bigint as page_views
      from events group by event_name
    ) e
  ),
  pages as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'page_path', page_path,
      'page_views', page_views,
      'property_views', property_views,
      'leads', leads,
      'whatsapp_clicks', whatsapp_clicks
    ) order by page_views desc, page_path), '[]'::jsonb) as data
    from (
      select page_path,
        count(distinct page_view_id) filter (where event_name = 'page_view')::bigint as page_views,
        count(*) filter (where event_name = 'view_item')::bigint as property_views,
        count(*) filter (where event_name = 'generate_lead')::bigint as leads,
        count(*) filter (where event_name = 'whatsapp_click')::bigint as whatsapp_clicks
      from events group by page_path
      order by 2 desc limit 100
    ) p
  ),
  campaigns as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'source', source,
      'medium', medium,
      'campaign', campaign,
      'page_views', page_views,
      'property_views', property_views,
      'leads', leads,
      'whatsapp_clicks', whatsapp_clicks
    ) order by page_views desc), '[]'::jsonb) as data
    from (
      select
        coalesce(nullif(utm_source, ''), '(direto)') as source,
        coalesce(nullif(utm_medium, ''), '(não informado)') as medium,
        coalesce(nullif(utm_campaign, ''), '(não informada)') as campaign,
        count(distinct page_view_id) filter (where event_name = 'page_view')::bigint as page_views,
        count(*) filter (where event_name = 'view_item')::bigint as property_views,
        count(*) filter (where event_name = 'generate_lead')::bigint as leads,
        count(*) filter (where event_name = 'whatsapp_click')::bigint as whatsapp_clicks
      from events
      group by 1, 2, 3
      order by 4 desc limit 100
    ) c
  ),
  property_metrics as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'item_id', item_id,
      'item_name', item_name,
      'views', views,
      'gallery_interactions', gallery_interactions,
      'favorites', favorites,
      'contacts', contacts,
      'leads', leads
    ) order by views desc, item_name), '[]'::jsonb) as data
    from (
      select
        properties ->> 'item_id' as item_id,
        max(nullif(properties ->> 'item_name', '')) as item_name,
        count(*) filter (where event_name = 'view_item')::bigint as views,
        count(*) filter (where event_name = 'gallery_interaction')::bigint as gallery_interactions,
        count(*) filter (where event_name = 'favorite_toggle')::bigint as favorites,
        count(*) filter (where event_name in ('whatsapp_click','phone_click'))::bigint as contacts,
        count(*) filter (where event_name = 'generate_lead')::bigint as leads
      from events
      where nullif(properties ->> 'item_id', '') is not null
      group by properties ->> 'item_id'
      order by 3 desc limit 100
    ) i
  ),
  consent as (
    select coalesce(jsonb_object_agg(consent_level, page_views), '{}'::jsonb) as data
    from (
      select consent_level, count(distinct page_view_id)::bigint as page_views
      from events where event_name = 'page_view' group by consent_level
    ) c
  ),
  delivery as (
    select jsonb_build_object(
      'total', count(*)::bigint,
      'delivered', count(*) filter (where status = 'delivered')::bigint,
      'pending', count(*) filter (where status in ('pending','dispatched','sending'))::bigint,
      'failed', count(*) filter (where status in ('failed','blocked'))::bigint,
      'by_event', coalesce((
        select jsonb_object_agg(event_type, total)
        from (
          select event_type, count(*)::bigint as total
          from private.tracking_delivery_logs
          where created_at >= v_since group by event_type
        ) x
      ), '{}'::jsonb)
    ) as data
    from private.tracking_delivery_logs
    where created_at >= v_since
  ),
  attribution as (
    select jsonb_build_object(
      'attributed_leads', count(*)::bigint,
      'with_meta_click', count(*) filter (where fbclid is not null or fbc is not null)::bigint,
      'with_google_click', count(*) filter (where gclid is not null or gbraid is not null or wbraid is not null)::bigint,
      'with_campaign_id', count(*) filter (where campaign_id is not null)::bigint
    ) as data
    from private.lead_attribution
    where last_seen_at >= v_since
  )
  select jsonb_build_object(
    'generated_at', now(),
    'period_days', v_days,
    'traffic', jsonb_build_object(
      'page_views', (select count(distinct page_view_id) from events where event_name = 'page_view'),
      'consented_sessions', (select count(distinct session_id) from events where session_id is not null),
      'engaged_30s', (select count(*) from per_view where engaged_seconds >= 30),
      'average_active_seconds', coalesce((select round(avg(engaged_seconds), 1) from per_view where engaged_seconds > 0), 0)
    ),
    'funnel', coalesce(funnel.data, '{}'::jsonb),
    'abandonment', jsonb_build_object(
      'form_started_without_lead', (select count(*) from per_view where started_form and not generated_lead),
      'submit_attempt_without_lead', (select count(*) from per_view where attempted_form and not generated_lead),
      'schedule_started_without_completion', (select count(*) from per_view where started_schedule and not completed_schedule)
    ),
    'events', event_totals.data,
    'pages', pages.data,
    'campaigns', campaigns.data,
    'properties', property_metrics.data,
    'consent', consent.data,
    'meta_delivery', delivery.data,
    'crm_attribution', attribution.data
  ) into v_result
  from funnel, event_totals, pages, campaigns, property_metrics, consent, delivery, attribution;

  return v_result;
end;
$$;

revoke all on function public.tracking_360_snapshot(integer) from public, anon;
grant execute on function public.tracking_360_snapshot(integer) to authenticated, service_role;

comment on function public.tracking_360_snapshot(integer) is
  'Contrato agregado, autenticado e sem PII para a Inteligencia Digital consumir tracking, funil, campanhas, imoveis e saude da CAPI.';

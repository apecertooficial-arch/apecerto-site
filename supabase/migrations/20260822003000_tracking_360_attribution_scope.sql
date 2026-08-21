-- Complemento do painel: separa o universo Meta elegível dos imports legados.
create or replace function public.tracking_360_attribution_scope(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 365));
  v_role text;
  v_result jsonb;
begin
  select u.role::text into v_role
  from public.usuarios u
  where u.id = auth.uid() and coalesce(u.ativo, true)
  limit 1;
  if v_role is null or v_role not in ('admin','gestor','executivo','gestor_comercial','gestor_equipe','diretor') then
    raise exception 'tracking_360_forbidden' using errcode = '42501';
  end if;

  with period_leads as (
    select * from public.leads where criado_em >= now() - make_interval(days => v_days)
  ),
  meta_scope as (
    select l.id, a.lead_id as attributed_id, a.meta_lead_id, a.campaign, a.campaign_id
    from period_leads l
    left join private.lead_attribution a on a.lead_id=l.id
    where l.origem='meta_lead_ads'
  ),
  coverage as (
    select count(*)::bigint eligible,
      count(*) filter (where attributed_id is not null)::bigint attributed,
      count(*) filter (where meta_lead_id is not null)::bigint with_meta_lead_id,
      round(100.0 * count(*) filter (where attributed_id is not null) / nullif(count(*),0), 1) coverage_percent
    from meta_scope
  ),
  origins as (
    select coalesce(jsonb_agg(jsonb_build_object('origin',origin,'leads',leads) order by leads desc),'[]'::jsonb) data
    from (
      select coalesce(nullif(origem,''),'sem_origem') origin,count(*)::bigint leads
      from period_leads group by 1 order by 2 desc limit 12
    ) x
  ),
  campaigns as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'campaign',campaign,'campaign_id',campaign_id,'leads',leads
    ) order by leads desc),'[]'::jsonb) data
    from (
      select coalesce(nullif(a.campaign,''),'Campanha sem nome') campaign,
        a.campaign_id,count(*)::bigint leads
      from private.lead_attribution a
      join period_leads l on l.id=a.lead_id
      group by a.campaign,a.campaign_id order by 3 desc limit 12
    ) x
  )
  select jsonb_build_object(
    'eligible',coverage.eligible,
    'attributed',coverage.attributed,
    'with_meta_lead_id',coverage.with_meta_lead_id,
    'coverage_percent',coverage.coverage_percent,
    'origins',origins.data,
    'campaigns',campaigns.data
  ) into v_result from coverage,origins,campaigns;
  return coalesce(v_result,'{}'::jsonb);
end;
$$;

revoke all on function public.tracking_360_attribution_scope(integer) from public,anon;
grant execute on function public.tracking_360_attribution_scope(integer) to authenticated;
comment on function public.tracking_360_attribution_scope(integer) is
  'Cobertura de atribuição somente no universo Meta Lead Ads elegível, sem misturar imports legados.';

-- Liga o lead canonico do ERP ao ID original de um formulario instantaneo Meta.
-- O campo fica no schema privado e so pode ser escrito pelo service_role.

alter table private.lead_attribution
  add column if not exists meta_lead_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'lead_attribution_meta_lead_id_check'
      and conrelid = 'private.lead_attribution'::regclass
  ) then
    alter table private.lead_attribution
      add constraint lead_attribution_meta_lead_id_check
      check (meta_lead_id is null or meta_lead_id ~ '^[0-9]{15,17}$');
  end if;
end
$$;

create unique index if not exists lead_attribution_meta_lead_id_idx
  on private.lead_attribution (meta_lead_id)
  where meta_lead_id is not null;

create or replace function public.tracking_set_meta_lead_id(
  p_lead_id bigint,
  p_meta_lead_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta_lead_id text := btrim(coalesce(p_meta_lead_id, ''));
begin
  if p_lead_id is null or v_meta_lead_id !~ '^[0-9]{15,17}$' then
    return false;
  end if;

  insert into private.lead_attribution (lead_id, meta_lead_id)
  values (p_lead_id, v_meta_lead_id)
  on conflict (lead_id) do update
    set meta_lead_id = excluded.meta_lead_id,
        updated_at = now();
  return true;
end;
$$;

revoke all on function public.tracking_set_meta_lead_id(bigint,text)
  from public, anon, authenticated;
grant execute on function public.tracking_set_meta_lead_id(bigint,text)
  to service_role;

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
      'fbp', a.fbp, 'fbc', a.fbc, 'landing_path', a.landing_path,
      'campaign', a.campaign, 'campaign_id', a.campaign_id,
      'adset_id', a.adset_id, 'ad_id', a.ad_id, 'creative_id', a.creative_id,
      'source', a.source, 'medium', a.medium
    ))
    from private.lead_attribution a where a.lead_id = p_lead_id
  ), '{}'::jsonb);
$$;

revoke all on function public.tracking_lead_attribution(bigint)
  from public, anon, authenticated;
grant execute on function public.tracking_lead_attribution(bigint)
  to service_role;

comment on column private.lead_attribution.meta_lead_id is
  'ID original do lead de formulario instantaneo Meta (15-17 digitos).';
comment on function public.tracking_set_meta_lead_id(bigint,text) is
  'Vincula, somente via service_role, o lead canonico do ERP ao lead_id original da Meta.';

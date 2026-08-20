-- Tracking 360 / recibos das Edge Functions.
-- As Edge Functions nao acessam tabelas do schema private pelo Data API;
-- estes RPCs estreitos mantem a tabela fechada e liberam somente a operacao necessaria.

create or replace function public.tracking_delivery_upsert(
  p_channel text,
  p_event_id text,
  p_event_type text,
  p_source_table text,
  p_source_id text,
  p_status text,
  p_error_code text default null,
  p_last_error text default null,
  p_next_attempt_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;
  if p_status not in ('pending','dispatched','sending','delivered','failed','blocked','skipped') then
    raise exception 'status_invalido' using errcode = '22023';
  end if;

  insert into private.tracking_delivery_logs (
    channel, event_id, event_type, source_table, source_id, status,
    attempt_count, error_code, last_error, next_attempt_at, updated_at
  ) values (
    left(p_channel, 40), left(p_event_id, 100), left(p_event_type, 80),
    left(p_source_table, 80), left(p_source_id, 120), p_status,
    1, left(p_error_code, 80), left(p_last_error, 500), p_next_attempt_at, now()
  )
  on conflict (channel, event_id) do update
  set event_type = excluded.event_type,
      source_table = excluded.source_table,
      source_id = excluded.source_id,
      status = excluded.status,
      attempt_count = private.tracking_delivery_logs.attempt_count + 1,
      error_code = excluded.error_code,
      last_error = excluded.last_error,
      next_attempt_at = excluded.next_attempt_at,
      updated_at = now()
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.tracking_delivery_update(
  p_id uuid,
  p_status text,
  p_response_status integer default null,
  p_fbtrace_id text default null,
  p_error_code text default null,
  p_last_error text default null,
  p_next_attempt_at timestamptz default null,
  p_delivered_at timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;
  if p_status not in ('pending','dispatched','sending','delivered','failed','blocked','skipped') then
    raise exception 'status_invalido' using errcode = '22023';
  end if;

  update private.tracking_delivery_logs
  set status = p_status,
      response_status = p_response_status,
      fbtrace_id = left(p_fbtrace_id, 200),
      error_code = left(p_error_code, 80),
      last_error = left(p_last_error, 500),
      next_attempt_at = p_next_attempt_at,
      delivered_at = p_delivered_at,
      updated_at = now()
  where id = p_id;
  return found;
end;
$$;

create or replace function public.tracking_lead_attribution(p_lead_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.role() = 'service_role' then
    coalesce((
      select jsonb_strip_nulls(jsonb_build_object(
        'fbp', a.fbp, 'fbc', a.fbc, 'landing_path', a.landing_path,
        'campaign', a.campaign, 'campaign_id', a.campaign_id,
        'adset_id', a.adset_id, 'ad_id', a.ad_id, 'creative_id', a.creative_id,
        'source', a.source, 'medium', a.medium
      ))
      from private.lead_attribution a where a.lead_id = p_lead_id
    ), '{}'::jsonb)
  else '{}'::jsonb end;
$$;

revoke all on function public.tracking_delivery_upsert(text,text,text,text,text,text,text,text,timestamptz)
  from public, anon, authenticated;
revoke all on function public.tracking_delivery_update(uuid,text,integer,text,text,text,timestamptz,timestamptz)
  from public, anon, authenticated;
revoke all on function public.tracking_lead_attribution(bigint)
  from public, anon, authenticated;
grant execute on function public.tracking_delivery_upsert(text,text,text,text,text,text,text,text,timestamptz)
  to service_role;
grant execute on function public.tracking_delivery_update(uuid,text,integer,text,text,text,timestamptz,timestamptz)
  to service_role;
grant execute on function public.tracking_lead_attribution(bigint)
  to service_role;

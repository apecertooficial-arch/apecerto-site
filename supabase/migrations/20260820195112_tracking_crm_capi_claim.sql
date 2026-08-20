create or replace function public.tracking_delivery_claim(
  p_id uuid,
  p_event_type text,
  p_source_table text,
  p_source_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'acesso_negado' using errcode = '42501';
  end if;

  update private.tracking_delivery_logs
  set status = 'sending', error_code = null, last_error = null, updated_at = now()
  where id = p_id
    and channel = 'meta_crm'
    and event_type = left(p_event_type, 80)
    and source_table = left(p_source_table, 80)
    and source_id = left(p_source_id, 120)
    and status in ('pending', 'dispatched', 'failed', 'blocked');

  return found;
end;
$$;

revoke all on function public.tracking_delivery_claim(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.tracking_delivery_claim(uuid,text,text,text)
  to service_role;

comment on function public.tracking_delivery_claim(uuid,text,text,text) is
  'Autoriza a CAPI interna somente quando o evento corresponde a um fato canonico previamente enfileirado.';

create table if not exists private.sara_site_usage (
  client_hash text not null,
  window_start timestamptz not null,
  requests integer not null default 1 check (requests > 0),
  last_request_at timestamptz not null default now(),
  primary key (client_hash, window_start)
);

alter table private.sara_site_usage enable row level security;
revoke all on table private.sara_site_usage from public, anon, authenticated;

create or replace function public.sara_site_rate_check(
  p_client_hash text,
  p_limit integer default 20
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
  if p_client_hash is null or length(p_client_hash) < 32 then
    return false;
  end if;

  delete from private.sara_site_usage
  where window_start < now() - interval '7 days';

  insert into private.sara_site_usage (client_hash, window_start, requests, last_request_at)
  values (p_client_hash, v_window, 1, now())
  on conflict (client_hash, window_start) do update
    set requests = private.sara_site_usage.requests + 1,
        last_request_at = now()
    where private.sara_site_usage.requests < greatest(1, least(p_limit, 100))
  returning requests into v_requests;

  return v_requests is not null and v_requests <= greatest(1, least(p_limit, 100));
end;
$$;

revoke all on function public.sara_site_rate_check(text, integer) from public, anon, authenticated;
grant execute on function public.sara_site_rate_check(text, integer) to service_role;

comment on function public.sara_site_rate_check(text, integer) is
  'Rate limit persistente da Sara do site. Executavel somente pelo service_role da Edge Function.';

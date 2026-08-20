-- Observabilidade e fatos canônicos para conversões offline Meta.
-- Nenhum dado comercial é reescrito: os gatilhos apenas registram e enviam eventos.

create table if not exists private.tracking_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  channel text not null,
  event_id text not null,
  event_type text not null,
  source_table text not null,
  source_id text not null,
  negocio_id bigint,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending','dispatched','sending','delivered','failed','blocked','skipped')),
  attempt_count integer not null default 0,
  request_id bigint,
  response_status integer,
  fbtrace_id text,
  error_code text,
  last_error text,
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz
);

create unique index if not exists tracking_delivery_logs_channel_event_uidx
  on private.tracking_delivery_logs (channel, event_id);
create index if not exists tracking_delivery_logs_retry_idx
  on private.tracking_delivery_logs (next_attempt_at)
  where status in ('failed','blocked');

alter table private.tracking_delivery_logs enable row level security;
revoke all on private.tracking_delivery_logs from public, anon, authenticated;

-- Reaproveita a chave anon que já estava no gatilho legado, mas a transfere para
-- o Vault sem imprimir nem versionar o segredo. A função antiga é substituída
-- logo abaixo e deixa de conter credencial em texto claro.
do $$
declare
  v_definition text;
  v_match text[];
begin
  if not exists (select 1 from vault.secrets where name = 'crm_capi_anon_key') then
    select pg_get_functiondef(p.oid)
      into v_definition
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'negocio_meta_capi'
    limit 1;

    v_match := regexp_match(coalesce(v_definition, ''), 'v_key text := ''([^'']+)''');
    if v_match is null then
      raise exception 'crm_capi_anon_key_not_found';
    end if;
    perform vault.create_secret(v_match[1], 'crm_capi_anon_key', 'JWT anon usado apenas pelo dispatcher interno da CAPI');
  end if;
end
$$;

create or replace function private.dispatch_tracking_delivery(p_delivery_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery private.tracking_delivery_logs%rowtype;
  v_key text;
  v_request_id bigint;
begin
  select * into v_delivery
  from private.tracking_delivery_logs
  where id = p_delivery_id;

  if v_delivery.id is null or v_delivery.channel <> 'meta_crm' then
    return null;
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'crm_capi_anon_key'
  limit 1;

  if coalesce(v_key, '') = '' then
    update private.tracking_delivery_logs
      set status = 'blocked', error_code = 'dispatcher_secret_missing',
          last_error = 'Credencial interna ausente no Vault',
          next_attempt_at = now() + interval '5 minutes', updated_at = now()
    where id = p_delivery_id;
    return null;
  end if;

  v_request_id := net.http_post(
    url := 'https://diaegvfveqezispcthwk.supabase.co/functions/v1/crm-capi',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key,
      'apikey', v_key
    ),
    body := v_delivery.payload || jsonb_build_object('delivery_id', v_delivery.id)
  );

  update private.tracking_delivery_logs
    set status = 'dispatched', request_id = v_request_id,
        attempt_count = attempt_count + 1, updated_at = now()
  where id = p_delivery_id;
  return v_request_id;
exception when others then
  update private.tracking_delivery_logs
    set status = 'failed', error_code = 'dispatch_error', last_error = sqlerrm,
        next_attempt_at = now() + interval '5 minutes', updated_at = now()
  where id = p_delivery_id;
  return null;
end;
$$;

revoke all on function private.dispatch_tracking_delivery(uuid) from public, anon, authenticated;

create or replace function public.negocio_meta_capi()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery_id uuid;
begin
  if new.stage_id = 68 and coalesce(old.stage_id, 0) <> 68 then
    insert into private.tracking_delivery_logs
      (channel,event_id,event_type,source_table,source_id,negocio_id,payload)
    values
      ('meta_crm','qualified-' || new.id,'qualified','negocios',new.id::text,new.id,
       jsonb_build_object('event_type','qualified','source_table','negocios','source_id',new.id::text,'negocio_id',new.id))
    on conflict (channel,event_id) do nothing
    returning id into v_delivery_id;

    if v_delivery_id is not null then
      perform private.dispatch_tracking_delivery(v_delivery_id);
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.fato_canonico_meta_capi()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text;
  v_event_id text;
  v_source_id text := new.id::text;
  v_negocio_id bigint;
  v_delivery_id uuid;
begin
  if tg_table_name = 'visitas' then
    if new.status = 'realizada' and (tg_op = 'INSERT' or coalesce(old.status, '') <> 'realizada') then
      v_event_type := 'visit';
      v_negocio_id := new.negocio_id;
    end if;
  elsif tg_table_name = 'ncrm_proposta' then
    if tg_op = 'INSERT' then
      v_event_type := 'proposal';
      v_negocio_id := new.negocio_id;
    end if;
  elsif tg_table_name = 'vendas' then
    if new.status::text in ('concluido','pago')
       and (tg_op = 'INSERT' or coalesce(old.status::text, '') not in ('concluido','pago')) then
      v_event_type := 'purchase';
      select n.id into v_negocio_id from public.negocios n where n.venda_id = new.id limit 1;
      if v_negocio_id is null then
        select p.negocio_id into v_negocio_id from public.ncrm_proposta p where p.venda_id = new.id limit 1;
      end if;
    end if;
  end if;

  if v_event_type is null then return new; end if;
  v_event_id := v_event_type || '-' || v_source_id;

  insert into private.tracking_delivery_logs
    (channel,event_id,event_type,source_table,source_id,negocio_id,payload)
  values
    ('meta_crm',v_event_id,v_event_type,tg_table_name,v_source_id,v_negocio_id,
     jsonb_build_object('event_type',v_event_type,'source_table',tg_table_name,'source_id',v_source_id,'negocio_id',v_negocio_id))
  on conflict (channel,event_id) do nothing
  returning id into v_delivery_id;

  if v_delivery_id is not null then
    perform private.dispatch_tracking_delivery(v_delivery_id);
  end if;
  return new;
end;
$$;

revoke all on function public.negocio_meta_capi() from public, anon, authenticated;
revoke all on function public.fato_canonico_meta_capi() from public, anon, authenticated;

drop trigger if exists trg_negocio_meta_capi on public.negocios;
create trigger trg_negocio_meta_capi
after update of stage_id on public.negocios
for each row execute function public.negocio_meta_capi();

drop trigger if exists trg_visita_meta_capi on public.visitas;
create trigger trg_visita_meta_capi
after insert or update of status on public.visitas
for each row execute function public.fato_canonico_meta_capi();

drop trigger if exists trg_proposta_meta_capi on public.ncrm_proposta;
create trigger trg_proposta_meta_capi
after insert on public.ncrm_proposta
for each row execute function public.fato_canonico_meta_capi();

drop trigger if exists trg_venda_meta_capi on public.vendas;
create trigger trg_venda_meta_capi
after insert or update of status on public.vendas
for each row execute function public.fato_canonico_meta_capi();

create or replace function private.retry_meta_deliveries()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select id from private.tracking_delivery_logs
    where channel = 'meta_crm'
      and status in ('failed','blocked')
      and attempt_count < 5
      and next_attempt_at <= now()
    order by next_attempt_at
    limit 50
    for update skip locked
  loop
    perform private.dispatch_tracking_delivery(v_row.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.retry_meta_deliveries() from public, anon, authenticated;

do $$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname = 'tracking_meta_retry' limit 1;
  if v_jobid is not null then perform cron.unschedule(v_jobid); end if;
  perform cron.schedule('tracking_meta_retry', '*/5 * * * *', 'select private.retry_meta_deliveries()');
end
$$;

comment on table private.tracking_delivery_logs is
  'Outbox auditável de entregas a plataformas de mídia. Não armazena telefone ou email.';

-- Executar somente depois de 20260822150000_site_financing_lead_secure.sql.
-- Não cria nem altera dados.

do $$
declare
  v_def text;
  v_policy text;
  v_config text[];
  v_security_definer boolean;
  v_rate_rls boolean;
  v_rate_force boolean;
  v_receipt_rls boolean;
  v_receipt_force boolean;
begin
  select
    lower(p.prosrc),
    p.proconfig,
    p.prosecdef
  into strict v_def, v_config, v_security_definer
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'site_financing_lead_ingest'
    and pg_get_function_identity_arguments(p.oid) =
      'p_request_id uuid, p_payload_hash text, p_dedupe_hash text, p_ip_hash text, p_client_hash text, p_nome text, p_telefone text, p_email text, p_empreendimento_id uuid, p_unidade_id uuid, p_renda_mensal numeric, p_percentual_financiado integer, p_page_view_id uuid, p_tracking jsonb, p_page_url text';

  if not v_security_definer
     or array_position(v_config, 'search_path=""') is null
     or v_def not like '%site_financing_rate_take(''ip''%'
     or v_def not like '%site_financing_rate_take(''client''%'
     or v_def not like '%pg_advisory_xact_lock%site-financing:request:%'
     or v_def not like '%pg_advisory_xact_lock%site-financing:dedupe:%'
     or v_def not like '%created_at >= clock_timestamp() - interval ''30 minutes''%'
     or v_def not like '%delete from private.site_financing_lead_receipts%created_at < now() - interval ''30 days''%'
     or v_def not like '%''site_financiamento''%'
     or v_def not like '%''item_name'', v_item_name%'
     or v_def not like '%''conversion_event_id'', p_request_id%' then
    raise exception 'FALHA: RPC de financiamento incompleta ou insegura';
  end if;

  if has_function_privilege('anon', 'public.site_financing_lead_ingest(uuid,text,text,text,text,text,text,text,uuid,uuid,numeric,integer,uuid,jsonb,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.site_financing_lead_ingest(uuid,text,text,text,text,text,text,text,uuid,uuid,numeric,integer,uuid,jsonb,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.site_financing_lead_ingest(uuid,text,text,text,text,text,text,text,uuid,uuid,numeric,integer,uuid,jsonb,text)', 'EXECUTE') then
    raise exception 'FALHA: grants da RPC não são service-role-only';
  end if;

  select relrowsecurity, relforcerowsecurity
    into strict v_rate_rls, v_rate_force
  from pg_class
  where oid = 'private.site_financing_lead_rate_usage'::regclass;

  select relrowsecurity, relforcerowsecurity
    into strict v_receipt_rls, v_receipt_force
  from pg_class
  where oid = 'private.site_financing_lead_receipts'::regclass;

  if not v_rate_rls or not v_rate_force or not v_receipt_rls or not v_receipt_force then
    raise exception 'FALHA: tabelas privadas sem RLS forçada';
  end if;

  if has_table_privilege('anon', 'private.site_financing_lead_rate_usage', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'private.site_financing_lead_rate_usage', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('service_role', 'private.site_financing_lead_rate_usage', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('anon', 'private.site_financing_lead_receipts', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'private.site_financing_lead_receipts', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('service_role', 'private.site_financing_lead_receipts', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'FALHA: tabela interna exposta a papéis da API';
  end if;

  select lower(pg_get_expr(polwithcheck, polrelid))
    into strict v_policy
  from pg_policy
  where polrelid = 'public.site_leads'::regclass
    and polname = 'site_leads_insert_anon'
    and polcmd = 'a';

  if v_policy not like '%lead_type = any (array[''comprador''%''proprietario''%'
     or v_policy like '%''financiamento''%' then
    raise exception 'FALHA: financiamento ainda pode inserir diretamente como anon/authenticated';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.site_leads'::regclass
      and conname = 'site_leads_context_check'
      and lower(pg_get_constraintdef(oid, true)) like '%item_name%'
      and lower(pg_get_constraintdef(oid, true)) like '%item_codigo%'
      and lower(pg_get_constraintdef(oid, true)) like '%page_url%'
      and convalidated
  ) then
    raise exception 'FALHA: contexto canônico não preserva item/código/URL';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'private'
      and indexname = 'site_financing_lead_rate_window_idx'
  ) then
    raise exception 'FALHA: cleanup de rate limit sem índice por janela';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'private'
      and indexname = 'site_financing_lead_receipts_dedupe_idx'
      and lower(indexdef) like '%(dedupe_hash, created_at desc)%'
  ) then
    raise exception 'FALHA: dedupe móvel sem índice por hash/data';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'private'
      and indexname = 'site_events_generate_lead_event_id_uidx'
      and lower(indexdef) like '%unique index%'
      and lower(indexdef) like '%event_id%'
  ) then
    raise exception 'FALHA: generate_lead ainda não é idempotente por event_id';
  end if;

  if exists (
    select properties ->> 'event_id'
    from private.site_events_anon
    where event_name = 'generate_lead'
      and nullif(properties ->> 'event_id', '') is not null
    group by properties ->> 'event_id'
    having count(*) > 1
  ) then
    raise exception 'FALHA: conversões generate_lead duplicadas por event_id';
  end if;
end;
$$;

select jsonb_build_object(
  'rpc_service_only', true,
  'public_financing_direct_insert', false,
  'dual_rate_limit', true,
  'lead_idempotency', true,
  'conversion_idempotency', true,
  'receipt_retention_days', 30
) as site_financing_backend_status;

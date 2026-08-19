-- Tracking 360 / Fase 2
-- Um contrato de lead para comprador, proprietario e financiamento.

alter table public.site_leads
  add column if not exists lead_type text not null default 'comprador',
  add column if not exists context jsonb not null default '{}'::jsonb;

alter table public.captacoes_portal
  add column if not exists site_lead_id uuid references public.site_leads(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'site_leads_type_check') then
    alter table public.site_leads add constraint site_leads_type_check
      check (lead_type in ('comprador', 'proprietario', 'financiamento'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'site_leads_context_check') then
    alter table public.site_leads add constraint site_leads_context_check check (
      jsonb_typeof(context) = 'object'
      and octet_length(context::text) <= 8000
      and (context - array[
        'empreendimento_id', 'empreendimento_nome', 'preferencia_horario',
        'captacao_id', 'finalidade', 'bairro', 'cidade', 'area_util',
        'valor_imovel', 'percentual_financiado', 'valor_entrada',
        'valor_financiar', 'renda_mensal', 'estado_civil', 'objetivo',
        'tipo_imovel', 'source'
      ]::text[]) = '{}'::jsonb
    );
  end if;
end
$$;

create index if not exists site_leads_type_created_idx
  on public.site_leads (lead_type, criado_em desc);
create index if not exists captacoes_portal_site_lead_idx
  on public.captacoes_portal (site_lead_id)
  where site_lead_id is not null;

drop policy if exists site_leads_insert_anon on public.site_leads;
create policy site_leads_insert_anon
on public.site_leads
for insert
to anon, authenticated
with check (
  char_length(trim(nome)) between 2 and 120
  and char_length(regexp_replace(telefone, '[^0-9]', '', 'g')) between 8 and 15
  and (email is null or char_length(email) between 3 and 254)
  and origem = 'site'
  and lead_type in ('comprador', 'proprietario', 'financiamento')
  and not atendido
  and crm_lead_id is null
  and crm_negocio_id is null
  and crm_synced_at is null
  and crm_sync_error is null
  and jsonb_typeof(tracking) = 'object'
  and jsonb_typeof(context) = 'object'
  and octet_length(context::text) <= 8000
  and (context - array[
    'empreendimento_id', 'empreendimento_nome', 'preferencia_horario',
    'captacao_id', 'finalidade', 'bairro', 'cidade', 'area_util',
    'valor_imovel', 'percentual_financiado', 'valor_entrada',
    'valor_financiar', 'renda_mensal', 'estado_civil', 'objetivo',
    'tipo_imovel', 'source'
  ]::text[]) = '{}'::jsonb
);

revoke all on table public.site_leads from anon, authenticated;
grant insert on table public.site_leads to anon;
grant select, insert, update on table public.site_leads to authenticated;

create or replace function public.site_lead_sync_crm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := regexp_replace(coalesce(new.telefone, ''), '[^0-9]', '', 'g');
  v_first_touch jsonb := coalesce(new.tracking #> '{attribution,first}', '{}'::jsonb);
  v_last_touch jsonb := coalesce(
    new.tracking #> '{attribution,last}',
    new.tracking #> '{attribution,current}',
    new.tracking #> '{attribution,first}',
    '{}'::jsonb
  );
  v_identity jsonb := coalesce(new.tracking -> 'identity', '{}'::jsonb);
  v_context jsonb := coalesce(new.context, '{}'::jsonb);
  v_origin text;
  v_pipeline_id bigint;
  v_stage_id bigint;
  v_lead_id bigint;
  v_negocio_id bigint;
  v_session_text text;
  v_session_id uuid;
  v_first_seen_at timestamptz := now();
begin
  if jsonb_typeof(v_first_touch) <> 'object' then v_first_touch := '{}'::jsonb; end if;
  if jsonb_typeof(v_last_touch) <> 'object' then v_last_touch := '{}'::jsonb; end if;
  if jsonb_typeof(v_identity) <> 'object' then v_identity := '{}'::jsonb; end if;
  if jsonb_typeof(v_context) <> 'object' then v_context := '{}'::jsonb; end if;

  v_origin := coalesce(
    nullif(v_last_touch ->> 'utm_source', ''),
    case when nullif(v_last_touch ->> 'gclid', '') is not null then 'google' end,
    case when nullif(v_last_touch ->> 'fbclid', '') is not null then 'meta' end,
    'site_' || new.lead_type
  );

  v_session_text := nullif(v_identity ->> 'session_id', '');
  if v_session_text ~* '^[0-9a-f]{8}-[0-9a-f-]{27}$' then
    v_session_id := v_session_text::uuid;
  end if;

  begin
    if nullif(v_first_touch ->> 'captured_at', '') is not null then
      v_first_seen_at := (v_first_touch ->> 'captured_at')::timestamptz;
    end if;
  exception when invalid_datetime_format or datetime_field_overflow then
    v_first_seen_at := now();
  end;

  select p.id into v_pipeline_id
  from public.pipelines p
  where lower(trim(p.nome)) = lower('Funil 2.0')
  order by p.id desc
  limit 1;

  select l.id into v_lead_id
  from public.leads l
  where regexp_replace(coalesce(l.telefone, ''), '[^0-9]', '', 'g') = v_phone
  order by l.id desc
  limit 1;

  if v_lead_id is null then
    insert into public.leads (nome, telefone, email, pipeline_id, status, origem, extras)
    values (
      new.nome, v_phone, nullif(new.email, ''), v_pipeline_id, 'novo', v_origin,
      jsonb_build_object(
        'site_last_lead_id', new.id,
        'site_lead_type', new.lead_type,
        'site_context', v_context,
        'site_first_touch', v_first_touch,
        'site_last_touch', v_last_touch,
        'site_tracking_identity', v_identity,
        'site_empreendimento_id', new.empreendimento_id,
        'site_empreendimento_nome', new.empreendimento_nome,
        'site_preferencia_horario', new.preferencia_horario
      )
    )
    returning id into v_lead_id;
  else
    update public.leads
    set nome = coalesce(nullif(new.nome, ''), nome),
        email = coalesce(email, nullif(new.email, '')),
        atualizado_em = now(),
        extras = coalesce(extras, '{}'::jsonb) || jsonb_build_object(
          'site_last_lead_id', new.id,
          'site_lead_type', new.lead_type,
          'site_context', v_context,
          'site_first_touch', coalesce(extras -> 'site_first_touch', v_first_touch),
          'site_last_touch', v_last_touch,
          'site_tracking_identity', v_identity,
          'site_empreendimento_id', new.empreendimento_id,
          'site_empreendimento_nome', new.empreendimento_nome,
          'site_preferencia_horario', new.preferencia_horario
        )
    where id = v_lead_id;
  end if;

  insert into private.lead_attribution (
    lead_id, first_touch, last_touch, last_site_lead_id, last_page_view_id,
    last_session_id, ga_client_id, ga_session_id, source, medium, campaign,
    campaign_id, adset_id, ad_group_id, ad_id, creative_id, utm_content,
    utm_term, gclid, gbraid, wbraid, fbclid, fbp, fbc, landing_path,
    referrer_host, first_seen_at, last_seen_at, updated_at
  ) values (
    v_lead_id, v_first_touch, v_last_touch, new.id, new.page_view_id,
    v_session_id, left(nullif(v_identity ->> 'ga_client_id', ''), 120),
    left(nullif(v_identity ->> 'ga_session_id', ''), 120), v_origin,
    left(nullif(v_last_touch ->> 'utm_medium', ''), 120),
    left(nullif(v_last_touch ->> 'utm_campaign', ''), 200),
    left(nullif(v_last_touch ->> 'campaign_id', ''), 200),
    left(nullif(v_last_touch ->> 'adset_id', ''), 200),
    left(nullif(v_last_touch ->> 'ad_group_id', ''), 200),
    left(nullif(v_last_touch ->> 'ad_id', ''), 200),
    left(nullif(v_last_touch ->> 'creative_id', ''), 200),
    left(nullif(v_last_touch ->> 'utm_content', ''), 200),
    left(nullif(v_last_touch ->> 'utm_term', ''), 200),
    left(nullif(v_last_touch ->> 'gclid', ''), 500),
    left(nullif(v_last_touch ->> 'gbraid', ''), 500),
    left(nullif(v_last_touch ->> 'wbraid', ''), 500),
    left(nullif(v_last_touch ->> 'fbclid', ''), 500),
    left(nullif(v_identity ->> 'fbp', ''), 500),
    left(nullif(v_identity ->> 'fbc', ''), 500),
    left(coalesce(nullif(v_first_touch ->> 'landing_path', ''), new.tracking ->> 'landing_path'), 500),
    left(coalesce(nullif(v_first_touch ->> 'referrer_host', ''), new.tracking ->> 'referrer_host'), 200),
    v_first_seen_at, now(), now()
  )
  on conflict (lead_id) do update
  set first_touch = case
        when private.lead_attribution.first_touch = '{}'::jsonb then excluded.first_touch
        else private.lead_attribution.first_touch
      end,
      last_touch = excluded.last_touch,
      last_site_lead_id = excluded.last_site_lead_id,
      last_page_view_id = excluded.last_page_view_id,
      last_session_id = excluded.last_session_id,
      ga_client_id = coalesce(excluded.ga_client_id, private.lead_attribution.ga_client_id),
      ga_session_id = coalesce(excluded.ga_session_id, private.lead_attribution.ga_session_id),
      source = excluded.source,
      medium = excluded.medium,
      campaign = excluded.campaign,
      campaign_id = excluded.campaign_id,
      adset_id = excluded.adset_id,
      ad_group_id = excluded.ad_group_id,
      ad_id = excluded.ad_id,
      creative_id = excluded.creative_id,
      utm_content = excluded.utm_content,
      utm_term = excluded.utm_term,
      gclid = coalesce(excluded.gclid, private.lead_attribution.gclid),
      gbraid = coalesce(excluded.gbraid, private.lead_attribution.gbraid),
      wbraid = coalesce(excluded.wbraid, private.lead_attribution.wbraid),
      fbclid = coalesce(excluded.fbclid, private.lead_attribution.fbclid),
      fbp = coalesce(excluded.fbp, private.lead_attribution.fbp),
      fbc = coalesce(excluded.fbc, private.lead_attribution.fbc),
      landing_path = coalesce(private.lead_attribution.landing_path, excluded.landing_path),
      referrer_host = coalesce(private.lead_attribution.referrer_host, excluded.referrer_host),
      last_seen_at = now(),
      updated_at = now();

  if v_pipeline_id is not null then
    select n.id into v_negocio_id
    from public.negocios n
    where n.lead_id = v_lead_id
      and n.pipeline_id = v_pipeline_id
      and n.status = 'aberto'
    order by n.id desc
    limit 1;

    if v_negocio_id is null then
      select ps.id into v_stage_id
      from public.pipeline_stages ps
      where ps.pipeline_id = v_pipeline_id
      order by ps.ordem nulls last, ps.id
      limit 1;

      insert into public.negocios (
        lead_id, pipeline_id, stage_id, empreendimento_id, status,
        ultima_movimentacao, raw
      ) values (
        v_lead_id, v_pipeline_id, v_stage_id, new.empreendimento_id, 'aberto',
        now(), jsonb_build_object(
          'origem', v_origin,
          'site_lead_id', new.id,
          'site_lead_type', new.lead_type,
          'site_context', v_context,
          'tracking_first_touch', v_first_touch,
          'tracking_last_touch', v_last_touch,
          'tracking_identity', v_identity
        )
      ) returning id into v_negocio_id;
    else
      update public.negocios
      set empreendimento_id = coalesce(empreendimento_id, new.empreendimento_id),
          ultima_movimentacao = now(),
          raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object(
            'site_last_lead_id', new.id,
            'site_lead_type', new.lead_type,
            'site_context', v_context,
            'tracking_first_touch', coalesce(raw -> 'tracking_first_touch', v_first_touch),
            'tracking_last_touch', v_last_touch,
            'tracking_identity', v_identity
          )
      where id = v_negocio_id;
    end if;

    begin
      perform public.f2_entrada_direta(v_negocio_id, 'novo');
    exception when others then null;
    end;
  end if;

  update public.site_leads
  set crm_lead_id = v_lead_id,
      crm_negocio_id = v_negocio_id,
      crm_synced_at = now(),
      crm_sync_error = null
  where id = new.id;
  return new;
exception when others then
  update public.site_leads
  set crm_sync_error = left(sqlstate || ': ' || sqlerrm, 240)
  where id = new.id;
  return new;
end;
$$;

revoke all on function public.site_lead_sync_crm() from public, anon, authenticated;
grant execute on function public.site_lead_sync_crm() to service_role;

create or replace function private.captacao_portal_sync_site_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site_lead_id uuid;
begin
  if new.site_lead_id is not null then return new; end if;
  if char_length(trim(coalesce(new.contato_nome, ''))) < 2
     or char_length(regexp_replace(coalesce(new.contato_telefone, ''), '[^0-9]', '', 'g')) < 8 then
    raise exception 'Contato do proprietario incompleto';
  end if;

  insert into public.site_leads (
    nome, telefone, email, origem, lead_type, page_view_id, tracking, context
  ) values (
    new.contato_nome, new.contato_telefone, nullif(new.contato_email, ''),
    'site', 'proprietario', new.page_view_id, coalesce(new.tracking, '{}'::jsonb),
    jsonb_strip_nulls(jsonb_build_object(
      'captacao_id', new.id,
      'finalidade', new.finalidade,
      'bairro', new.bairro,
      'cidade', new.cidade,
      'area_util', new.area_util,
      'source', 'owner_portal'
    ))
  ) returning id into v_site_lead_id;

  new.site_lead_id := v_site_lead_id;
  return new;
end;
$$;

revoke all on function private.captacao_portal_sync_site_lead() from public, anon, authenticated;
grant execute on function private.captacao_portal_sync_site_lead() to service_role;

drop trigger if exists trg_captacao_portal_sync_site_lead on public.captacoes_portal;
create trigger trg_captacao_portal_sync_site_lead
before insert on public.captacoes_portal
for each row execute function private.captacao_portal_sync_site_lead();

comment on column public.site_leads.lead_type is
  'Tipo comercial canonico do lead publico: comprador, proprietario ou financiamento.';
comment on column public.site_leads.context is
  'Contexto comercial permitido por lista fechada; documentos pessoais nao sao aceitos.';
comment on column public.captacoes_portal.site_lead_id is
  'Ponte auditavel entre a captacao do proprietario, o lead canonico e o CRM.';

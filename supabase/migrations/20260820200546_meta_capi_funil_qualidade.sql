-- Escada de qualidade CRM -> Meta baseada em fatos canônicos.
-- Eventos: respondeu, qualificacao iniciada, visita agendada/realizada, proposta e venda.

create or replace function private.enqueue_meta_crm_event(
  p_event_type text,
  p_source_table text,
  p_source_id text,
  p_negocio_id bigint,
  p_event_time timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery_id uuid;
  v_event_id text := p_event_type || '-' || p_source_id;
begin
  if p_event_type not in ('responded','qualification_started','visit_scheduled','visit','proposal','purchase')
     or coalesce(p_source_table, '') = ''
     or coalesce(p_source_id, '') = ''
     or p_negocio_id is null then
    return null;
  end if;

  insert into private.tracking_delivery_logs
    (channel,event_id,event_type,source_table,source_id,negocio_id,payload)
  values
    ('meta_crm',v_event_id,p_event_type,p_source_table,p_source_id,p_negocio_id,
     jsonb_build_object(
       'event_type',p_event_type,
       'source_table',p_source_table,
       'source_id',p_source_id,
       'negocio_id',p_negocio_id,
       'event_time',coalesce(p_event_time, now())
     ))
  on conflict (channel,event_id) do nothing
  returning id into v_delivery_id;

  if v_delivery_id is not null then
    perform private.dispatch_tracking_delivery(v_delivery_id);
  end if;
  return v_delivery_id;
end;
$$;

revoke all on function private.enqueue_meta_crm_event(text,text,text,bigint,timestamptz)
  from public, anon, authenticated;

create or replace function public.lead_meta_capi()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_momento text := lower(coalesce(old.momento_atual, old.momento, ''));
  v_new_momento text := lower(coalesce(new.momento_atual, new.momento, ''));
  v_event_type text;
  v_negocio_id bigint;
begin
  if v_new_momento = v_old_momento then return new; end if;

  if v_new_momento in ('respondeu','responde') then
    v_event_type := 'responded';
  elsif v_new_momento in ('qualificando','conversando_qualificando') then
    v_event_type := 'qualification_started';
  else
    return new;
  end if;

  select n.id into v_negocio_id
  from public.negocios n
  where n.lead_id = new.id
  order by coalesce(n.ultima_movimentacao, n.criado_em) desc nulls last, n.id desc
  limit 1;

  perform private.enqueue_meta_crm_event(
    v_event_type, 'leads', new.id::text, v_negocio_id,
    coalesce(new.atualizado_em, now())
  );
  return new;
end;
$$;

create or replace function public.wa_resposta_meta_capi()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead_id bigint;
  v_negocio_id bigint;
begin
  if lower(coalesce(new.direcao, '')) in ('out','saida','saída','enviada','sent') then
    return new;
  end if;

  select l.id into v_lead_id
  from public.wa_conversas c
  join public.leads l on l.wa_contato_id = c.contato_id
  where c.id = new.conversa_id
  order by coalesce(l.atualizado_em, l.criado_em) desc nulls last, l.id desc
  limit 1;

  if v_lead_id is null then return new; end if;

  select n.id into v_negocio_id
  from public.negocios n
  where n.lead_id = v_lead_id
  order by coalesce(n.ultima_movimentacao, n.criado_em) desc nulls last, n.id desc
  limit 1;

  perform private.enqueue_meta_crm_event(
    'responded', 'leads', v_lead_id::text, v_negocio_id,
    coalesce(new.enviado_em, new.criado_em, now())
  );
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
  v_negocio_id bigint;
  v_event_time timestamptz := now();
begin
  if tg_table_name = 'visitas' then
    if new.status = 'agendada' and (tg_op = 'INSERT' or coalesce(old.status, '') <> 'agendada') then
      v_event_type := 'visit_scheduled';
      v_negocio_id := new.negocio_id;
      v_event_time := coalesce(new.atualizado_em, new.criado_em, now());
    elsif new.status = 'realizada' and (tg_op = 'INSERT' or coalesce(old.status, '') <> 'realizada') then
      v_event_type := 'visit';
      v_negocio_id := new.negocio_id;
      v_event_time := coalesce(new.resultado_em, new.atualizado_em, new.criado_em, now());
    end if;
  elsif tg_table_name = 'ncrm_proposta' then
    if tg_op = 'INSERT' then
      v_event_type := 'proposal';
      v_negocio_id := new.negocio_id;
      v_event_time := coalesce(new.data_proposta, new.criada_em, now());
    end if;
  elsif tg_table_name = 'vendas' then
    if new.status::text in ('concluido','pago')
       and (tg_op = 'INSERT' or coalesce(old.status::text, '') not in ('concluido','pago')) then
      v_event_type := 'purchase';
      v_event_time := coalesce(new.data_conclusao, new.data_venda, new.created_at, now());
      select n.id into v_negocio_id from public.negocios n where n.venda_id = new.id limit 1;
      if v_negocio_id is null then
        select p.negocio_id into v_negocio_id from public.ncrm_proposta p where p.venda_id = new.id limit 1;
      end if;
    end if;
  end if;

  if v_event_type is not null then
    perform private.enqueue_meta_crm_event(
      v_event_type, tg_table_name, new.id::text, v_negocio_id, v_event_time
    );
  end if;
  return new;
end;
$$;

revoke all on function public.lead_meta_capi() from public, anon, authenticated;
revoke all on function public.wa_resposta_meta_capi() from public, anon, authenticated;
revoke all on function public.fato_canonico_meta_capi() from public, anon, authenticated;

-- Remove o sinal falso: stage_id 68 e "Em atendimento", nao qualificacao.
drop trigger if exists trg_negocio_meta_capi on public.negocios;

drop trigger if exists trg_lead_meta_capi on public.leads;
create trigger trg_lead_meta_capi
after update of momento_atual, momento on public.leads
for each row execute function public.lead_meta_capi();

drop trigger if exists trg_wa_resposta_meta_capi on public.wa_mensagens;
create trigger trg_wa_resposta_meta_capi
after insert on public.wa_mensagens
for each row execute function public.wa_resposta_meta_capi();

drop trigger if exists trg_visita_meta_capi on public.visitas;
create trigger trg_visita_meta_capi
after insert or update of status on public.visitas
for each row execute function public.fato_canonico_meta_capi();

-- Recupera somente fatos comprováveis dos últimos 7 dias, janela aceita pela Meta.
-- O mesmo event_id usado pelos gatilhos torna o retroativo idempotente.
do $$
declare
  v_row record;
begin
  for v_row in
    select distinct on (l.id)
      l.id as lead_id,
      n.id as negocio_id,
      coalesce(m.enviado_em, m.criado_em) as event_time
    from public.wa_mensagens m
    join public.wa_conversas c on c.id = m.conversa_id
    join public.leads l on l.wa_contato_id = c.contato_id
    join lateral (
      select nx.id
      from public.negocios nx
      where nx.lead_id = l.id
      order by coalesce(nx.ultima_movimentacao, nx.criado_em) desc nulls last, nx.id desc
      limit 1
    ) n on true
    where lower(coalesce(m.direcao, '')) not in ('out','saida','saída','enviada','sent')
      and coalesce(m.enviado_em, m.criado_em) >= now() - interval '7 days'
    order by l.id, coalesce(m.enviado_em, m.criado_em), m.id
  loop
    perform private.enqueue_meta_crm_event(
      'responded','leads',v_row.lead_id::text,v_row.negocio_id,v_row.event_time
    );
  end loop;

  for v_row in
    select distinct on (lm.lead_id)
      lm.lead_id,
      coalesce(lm.negocio_id, n.id) as negocio_id,
      lm.criado_em as event_time
    from public.lead_momentos lm
    left join lateral (
      select nx.id
      from public.negocios nx
      where nx.lead_id = lm.lead_id
      order by coalesce(nx.ultima_movimentacao, nx.criado_em) desc nulls last, nx.id desc
      limit 1
    ) n on true
    where lower(coalesce(lm.momento, '')) in ('qualificando','conversando_qualificando')
      and lm.criado_em >= now() - interval '7 days'
      and coalesce(lm.negocio_id, n.id) is not null
    order by lm.lead_id, lm.criado_em
  loop
    perform private.enqueue_meta_crm_event(
      'qualification_started','leads',v_row.lead_id::text,v_row.negocio_id,v_row.event_time
    );
  end loop;

  for v_row in
    select v.id, v.negocio_id, coalesce(v.atualizado_em, v.criado_em) as event_time
    from public.visitas v
    where v.status = 'agendada'
      and v.negocio_id is not null
      and coalesce(v.atualizado_em, v.criado_em) >= now() - interval '7 days'
  loop
    perform private.enqueue_meta_crm_event(
      'visit_scheduled','visitas',v_row.id::text,v_row.negocio_id,v_row.event_time
    );
  end loop;
end
$$;

comment on function private.enqueue_meta_crm_event(text,text,text,bigint,timestamptz) is
  'Outbox idempotente do funil CRM para Meta. Nao armazena PII.';
comment on function public.wa_resposta_meta_capi() is
  'Registra somente a primeira resposta recebida por lead; event_id impede duplicacao.';

-- Reparo único e auditável do fechamento Tracking 360.
-- Não cria trigger, cron nem escritor implícito de atribuição.
-- 1) Reprocessa somente entradas Meta já persistidas em leads.extras usando o
--    mesmo contrato canônico acionado pelo bloco explícito da Central.
-- 2) Enfileira somente conclusões históricas de qualificação comprovadas pelo
--    evento explícito do Funil 2.0.

do $$
declare
  v_lead record;
begin
  for v_lead in
    select l.id, l.extras
    from public.leads l
    left join private.lead_attribution a on a.lead_id = l.id
    where l.origem = 'meta_lead_ads'
      and coalesce(l.extras ->> 'meta_lead_id', l.extras ->> 'leadgen_id', '') ~ '^[0-9]{15,17}$'
      and a.lead_id is null
  loop
    perform private.motor_atribuicao_meta_por_campos(v_lead.id, v_lead.extras);
  end loop;
end;
$$;

do $$
declare
  v_event record;
begin
  for v_event in
    select
      e.id,
      e.criado_em,
      f.origem_negocio_id
    from public.f2_evento e
    join public.f2_lead f on f.id = e.funil_lead_id
    where e.tipo = 'momento_alterado'
      and e.payload ->> 'momento_anterior' = 'CONVERSANDO_QUALIFICANDO'
      and coalesce((e.payload ->> 'mesmo_momento')::boolean, false) = false
      and e.titulo ~* '^Momento atualizado para (Procurando produto|Produto enviado|Tentando agendamento|Visita agendada|Visita realizada)$'
      and f.origem_negocio_id is not null
      -- A API de Conversões aceita evento de site ocorrido, no máximo, nos
      -- últimos 7 dias. Histórico anterior continua coberto pelas listas CRM.
      and e.criado_em >= now() - interval '7 days'
  loop
    perform private.enqueue_meta_crm_event(
      'qualified',
      'f2_evento',
      v_event.id::text,
      v_event.origem_negocio_id,
      v_event.criado_em
    );
  end loop;
end;
$$;

comment on function private.motor_atribuicao_meta_por_campos(bigint, jsonb) is
  'Único escritor canônico da atribuição Meta; acionado pelo módulo explícito da Central. Reparo histórico de 2026-08-21 também reutilizou este contrato, sem automação futura.';

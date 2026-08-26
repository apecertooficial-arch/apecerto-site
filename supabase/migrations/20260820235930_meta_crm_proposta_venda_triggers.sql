-- Completa os fatos comerciais do funil CRM -> Meta.

drop trigger if exists trg_proposta_meta_capi on public.ncrm_proposta;
create trigger trg_proposta_meta_capi
after insert on public.ncrm_proposta
for each row execute function public.fato_canonico_meta_capi();

drop trigger if exists trg_venda_meta_capi on public.vendas;
create trigger trg_venda_meta_capi
after insert or update of status on public.vendas
for each row execute function public.fato_canonico_meta_capi();

comment on trigger trg_proposta_meta_capi on public.ncrm_proposta is
  'Enfileira PropostaEnviada na Meta CAPI quando nasce uma proposta real.';
comment on trigger trg_venda_meta_capi on public.vendas is
  'Enfileira Purchase na Meta CAPI quando a venda passa a concluida ou paga.';

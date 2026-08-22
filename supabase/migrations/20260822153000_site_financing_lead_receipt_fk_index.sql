-- Índice de suporte à FK usada quando um site_lead é removido.
-- Mantém a limpeza do recibo técnico eficiente sem ampliar permissões.
set lock_timeout = '5s';
set statement_timeout = '30s';

create index if not exists site_financing_lead_receipts_site_lead_idx
  on private.site_financing_lead_receipts (site_lead_id)
  where site_lead_id is not null;

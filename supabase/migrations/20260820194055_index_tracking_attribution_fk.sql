create index if not exists lead_attribution_last_site_lead_id_idx
  on private.lead_attribution (last_site_lead_id)
  where last_site_lead_id is not null;

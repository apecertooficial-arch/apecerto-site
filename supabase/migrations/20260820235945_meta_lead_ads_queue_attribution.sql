-- A automacao de entrada preserva o payload do Make em motor_fila.lead e,
-- depois de criar o lead canonico, acrescenta __lead_id. Este gatilho liga os
-- IDs do formulario/anuncio Meta ao lead real sem expor service_role no Make.

create or replace function private.sync_meta_lead_attribution_from_queue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_erp_lead_id_text text := coalesce(new.lead->>'__lead_id', '');
  v_erp_lead_id bigint;
  v_meta_lead_id text := btrim(coalesce(
    new.lead->>'meta_lead_id',
    new.lead->>'leadgen_id',
    ''
  ));
  v_existing_lead_id bigint;
  v_touch jsonb;
  v_seen_at timestamptz := now();
begin
  if v_erp_lead_id_text !~ '^[0-9]+$'
     or v_meta_lead_id !~ '^[0-9]{15,17}$' then
    return new;
  end if;
  v_erp_lead_id := v_erp_lead_id_text::bigint;

  -- O mesmo lead instantaneo nunca pode apontar para dois leads canonicos.
  select a.lead_id into v_existing_lead_id
  from private.lead_attribution a
  where a.meta_lead_id = v_meta_lead_id
  limit 1;
  if v_existing_lead_id is not null and v_existing_lead_id <> v_erp_lead_id then
    return new;
  end if;

  begin
    if coalesce(new.lead->>'meta_created_time', '') <> '' then
      v_seen_at := (new.lead->>'meta_created_time')::timestamptz;
    end if;
  exception when others then
    v_seen_at := now();
  end;

  v_touch := jsonb_strip_nulls(jsonb_build_object(
    'source', 'facebook',
    'medium', 'lead_ads',
    'campaign', nullif(new.lead->>'meta_campaign_name', ''),
    'campaign_id', nullif(new.lead->>'meta_campaign_id', ''),
    'adset', nullif(new.lead->>'meta_adset_name', ''),
    'adset_id', nullif(new.lead->>'meta_adset_id', ''),
    'ad', nullif(new.lead->>'meta_ad_name', ''),
    'ad_id', nullif(new.lead->>'meta_ad_id', ''),
    'form_id', nullif(new.lead->>'meta_form_id', ''),
    'page_id', nullif(new.lead->>'meta_page_id', ''),
    'leadgen_id', v_meta_lead_id,
    'is_organic', nullif(new.lead->>'meta_is_organic', ''),
    'created_time', v_seen_at
  ));

  insert into private.lead_attribution (
    lead_id, first_touch, last_touch, source, medium, campaign, campaign_id,
    adset_id, ad_id, meta_lead_id, first_seen_at, last_seen_at, updated_at
  ) values (
    v_erp_lead_id, v_touch, v_touch, 'facebook', 'lead_ads',
    nullif(new.lead->>'meta_campaign_name', ''),
    nullif(new.lead->>'meta_campaign_id', ''),
    nullif(new.lead->>'meta_adset_id', ''),
    nullif(new.lead->>'meta_ad_id', ''),
    v_meta_lead_id, v_seen_at, v_seen_at, now()
  )
  on conflict (lead_id) do update
    set first_touch = case
          when private.lead_attribution.first_touch = '{}'::jsonb then excluded.first_touch
          else private.lead_attribution.first_touch
        end,
        last_touch = excluded.last_touch,
        source = coalesce(excluded.source, private.lead_attribution.source),
        medium = coalesce(excluded.medium, private.lead_attribution.medium),
        campaign = coalesce(excluded.campaign, private.lead_attribution.campaign),
        campaign_id = coalesce(excluded.campaign_id, private.lead_attribution.campaign_id),
        adset_id = coalesce(excluded.adset_id, private.lead_attribution.adset_id),
        ad_id = coalesce(excluded.ad_id, private.lead_attribution.ad_id),
        meta_lead_id = coalesce(excluded.meta_lead_id, private.lead_attribution.meta_lead_id),
        last_seen_at = greatest(private.lead_attribution.last_seen_at, excluded.last_seen_at),
        updated_at = now();

  return new;
end;
$$;

revoke all on function private.sync_meta_lead_attribution_from_queue()
  from public, anon, authenticated;

drop trigger if exists trg_motor_fila_meta_attribution on public.motor_fila;
create trigger trg_motor_fila_meta_attribution
after insert or update of lead on public.motor_fila
for each row execute function private.sync_meta_lead_attribution_from_queue();

comment on function private.sync_meta_lead_attribution_from_queue() is
  'Liga leadgen_id e IDs de campanha do Make ao lead canonico criado pela automacao.';

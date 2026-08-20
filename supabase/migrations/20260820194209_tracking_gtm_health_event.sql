alter table private.site_events_anon
  drop constraint if exists site_events_event_name_check;

alter table private.site_events_anon
  add constraint site_events_event_name_check check (event_name = any (array[
    'page_view', 'consent_update', 'view_item', 'view_inventory',
    'generate_lead', 'whatsapp_click', 'phone_click', 'social_click',
    'sara_open', 'sara_search', 'sara_results', 'sara_error',
    'favorite_toggle', 'gallery_interaction', 'property_search',
    'cta_click', 'owner_cta_click', 'owner_portal_open', 'form_start',
    'form_submit_attempt', 'form_error', 'filter_change', 'scroll_depth',
    'engagement_time', 'page_exit', 'schedule_start', 'schedule_field_select',
    'schedule_complete', 'financing_open', 'financing_change', 'gtm_health'
  ]));

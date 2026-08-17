drop policy if exists site_events_anon_service_only on private.site_events_anon;
create policy site_events_anon_service_only
on private.site_events_anon
for all
to service_role
using (true)
with check (true);

drop policy if exists site_event_rate_usage_service_only on private.site_event_rate_usage;
create policy site_event_rate_usage_service_only
on private.site_event_rate_usage
for all
to service_role
using (true)
with check (true);

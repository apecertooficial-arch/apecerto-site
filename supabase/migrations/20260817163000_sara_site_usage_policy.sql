drop policy if exists sara_site_usage_service_only on private.sara_site_usage;
create policy sara_site_usage_service_only
on private.sara_site_usage
for all
to service_role
using (true)
with check (true);

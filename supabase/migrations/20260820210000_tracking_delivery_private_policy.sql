drop policy if exists tracking_delivery_service_role_all on private.tracking_delivery_logs;
create policy tracking_delivery_service_role_all
on private.tracking_delivery_logs
for all
to service_role
using (true)
with check (true);

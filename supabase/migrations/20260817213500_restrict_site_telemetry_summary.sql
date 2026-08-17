-- Keep the aggregate telemetry RPC internal. A future authenticated dashboard
-- should access it through a server-side endpoint that verifies the team role.
revoke all on function public.site_telemetry_summary(integer) from public, anon, authenticated;
grant execute on function public.site_telemetry_summary(integer) to service_role;


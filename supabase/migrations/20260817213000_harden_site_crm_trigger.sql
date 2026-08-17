-- The CRM synchronization function is a trigger implementation, not a public RPC.
-- PostgreSQL grants EXECUTE to PUBLIC on new functions unless explicitly revoked.
revoke all on function public.site_lead_sync_crm() from public, anon, authenticated;
grant execute on function public.site_lead_sync_crm() to service_role;


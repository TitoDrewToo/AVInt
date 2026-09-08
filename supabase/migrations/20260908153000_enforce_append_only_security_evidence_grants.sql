-- Supabase's platform-level service-role table grants are broader than the
-- table-local GRANT statements imply. Revoke them explicitly, then restore
-- only the append-only evidence contract.

revoke all on table public.prescan_security_events from service_role;
grant select, insert on table public.prescan_security_events to service_role;

revoke all on table public.prescan_admin_audit_events from service_role;
grant select, insert on table public.prescan_admin_audit_events to service_role;

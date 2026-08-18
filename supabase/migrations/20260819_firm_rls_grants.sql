-- Firm RLS helper permissions and storage-quota RPC hardening.
--
-- The firms, firm_admins, and firm_clients SELECT policies execute
-- public.is_firm_admin() as the authenticated database role. SECURITY DEFINER
-- protects the membership lookup from recursive RLS, while this grant allows
-- the policy expression itself to execute on the authenticated path.
grant execute on function public.is_firm_admin(uuid, uuid) to authenticated;

-- The quota function is used by server-side storage enforcement. It returns
-- only a limit, but anonymous callers have no reason to invoke it directly.
revoke execute on function public.avint_storage_quota_bytes(uuid) from anon;
grant execute on function public.avint_storage_quota_bytes(uuid) to authenticated;

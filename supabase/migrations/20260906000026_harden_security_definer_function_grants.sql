-- Close anon/authenticated execution on SECURITY DEFINER functions.
-- is_system_admin() is deliberately NOT revoked: 3 live RLS policies depend on
-- authenticated being able to execute it. Do not "clean it up".

-- 1. Revoke from PUBLIC, anon, authenticated (exact signatures)
REVOKE ALL ON FUNCTION public.avint_settle_document_normalization(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.avint_storage_quota_bytes(uuid)                          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_user_counter()                                 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable()                                        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.avint_enforce_file_storage_quota()                       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user_subscription()                           FROM PUBLIC, anon, authenticated;

-- 2. Re-grant service_role only where server code invokes it
GRANT EXECUTE ON FUNCTION public.avint_settle_document_normalization(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.avint_storage_quota_bytes(uuid)                          TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_user_counter()                                 TO service_role;

-- 3. Drop confirmed deprecation residue (0 triggers reference it)
DROP FUNCTION IF EXISTS public.set_virtual_updated_at();

-- 4. Default-privilege hardening: functions created by `postgres` (the role all
--    project migrations run as) are private to PUBLIC unless explicitly granted.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

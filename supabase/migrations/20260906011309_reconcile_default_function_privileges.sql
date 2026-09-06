-- Migration reconciliation.
--
-- Migration 20260906000026 recorded this statement as:
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--     REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
-- which is a no-op: Supabase's shipped default ACL grants EXECUTE explicitly to
-- anon and authenticated, and those explicit grants are what must be revoked.
-- The working form below was applied out-of-band on 6 Sep; this migration
-- records it so applied history matches the repository. Idempotent.
--
-- Do NOT add `FOR ROLE supabase_admin` here: postgres is not a member of that
-- role and the statement aborts the whole migration with
-- `42501: permission denied to change default privileges`.
--
-- PARTIAL BY DESIGN: this cannot remove PostgreSQL's hard-wired grant of
-- EXECUTE to PUBLIC on new functions (verified empirically with throwaway probe
-- functions; no event trigger is involved). Every migration creating a function
-- in `public` must still carry its own explicit revoke. See CLAUDE.md and
-- test/function_grant_contract.sql.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

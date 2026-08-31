-- public.is_firm_admin existed twice:
--   is_firm_admin(p_firm_id uuid)
--   is_firm_admin(p_firm_id uuid, p_user_id uuid default auth.uid())
--
-- The default on the second made every single-argument call ambiguous, so
-- `select public.is_firm_admin('...'::uuid)` failed with 42725 and the three
-- firm RLS policies could not be recreated on a fresh database. Found by
-- rebuilding the baseline schema into an empty database — nothing had ever
-- tried to build this schema from scratch before.
--
-- The one-argument version was dead: pg_depend showed all three policies
-- bound to the two-argument version, no function body in public referenced
-- it, and no application code called it. Dropping it removes the ambiguity
-- without changing any access-control behaviour.

drop function if exists public.is_firm_admin(uuid);

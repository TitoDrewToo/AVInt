# Codex Follow-up — firm RLS helper grant + minor hardening
### From the post-migration security-advisor review (18 Aug). Small; ship with the next push.

## Task 1 (do) — `is_firm_admin` EXECUTE for authenticated
The RLS policies on `firms`, `firm_admins`, and `firm_clients` call `public.is_firm_admin(...)`,
but that function's `EXECUTE` is **revoked from `authenticated`**. In Postgres, a role must have
EXECUTE on a function referenced in an RLS policy — so if any firm-admin/client read happens on the
**authenticated (non-service-role) path**, it will fail with `permission denied for function
is_firm_admin`.

**Fix (new idempotent migration):**
```sql
grant execute on function public.is_firm_admin(uuid, uuid) to authenticated;
```
`is_firm_admin` is `SECURITY DEFINER`, so it safely checks `firm_admins` without recursive RLS.
**OR**, if every firm read is intentionally service-role-only (`/api/firm/*` routes), instead
remove the now-dead `grant select ... to authenticated` + the authenticated SELECT policies on
those three tables to avoid misleading config. Granting execute is the safer default — but first
**confirm which path the firm dashboard actually uses** and make it consistent.

## Task 2 (optional / minor) — `avint_storage_quota_bytes` anon execute
`public.avint_storage_quota_bytes(uuid)` is callable by `anon` via `/rest/v1/rpc/...`. It returns
only a byte quota (low sensitivity), but if it's only called server-side, revoke `anon` execute
(keep `authenticated` if the app calls it as the signed-in user).

## Verify (not code — smoke test)
- A seat-enrolled client gets **full Pro-equivalent** access (document limits, report exports,
  features), not just the storage quota, for the year.
- An authenticated firm admin can read their own firm/clients without permission errors (confirms
  Task 1).

## Not in scope (pre-existing, separate cleanup later)
Old `partners` / `partner_payouts` / `partner_commissions_*` SECURITY-DEFINER views (ERROR-level),
`pg_net` in `public` schema, and Auth "leaked password protection" being off — all predate this
work; note for a future security pass.

## Acceptance
- Authenticated firm admins/clients read their scoped data without permission errors.
- Migration idempotent; TypeScript + lint + build pass.

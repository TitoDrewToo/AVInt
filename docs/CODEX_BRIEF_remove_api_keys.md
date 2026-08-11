# Codex Brief — Remove the MCP API-key path (go OAuth-only)

Security hardening. The Claude connector authenticates via WorkOS OAuth. The legacy
API-key (long-lived bearer token) path adds attack surface and long-lived-secret risk with
no current user need. Remove it entirely; OAuth becomes the only way to authenticate to
`/api/mcp`. **Auth/material change — verify OAuth still works end to end before considering
this done.**

Note: the 2 existing keys were already revoked out-of-band, so no live clients depend on
this path.

## Changes

1. **Auth fallback — `lib/mcp-auth.ts`**
   - Remove `resolveApiKey` and its helpers that become unused (`createApiKey`,
     `expiryDateFor`, `KeyExpiry` type, and `resolveJwtUser` if only the keys endpoint used it).
   - Keep `resolveOAuthToken`, `OAuthAccountRequiredError`, `entitlementForUser`,
     `supabaseAdmin`, `computeEntitlement` usage intact.

2. **MCP route — `app/api/mcp/[[...transport]]/route.ts`**
   - In `handle()`, drop the `identity ??= await resolveApiKey(req)` fallback. Auth is now
     OAuth-only: if `resolveOAuthToken` yields no identity, return 401 with the existing
     `WWW-Authenticate` challenge. Do not change tool logic, gating, or rate limits.

3. **Keys endpoint — `app/api/mcp-keys/route.ts`**
   - Remove the route entirely (GET list / POST generate+rotate / PATCH revoke / DELETE).
     Nothing should call it after the UI change.

4. **Connect UI — `app/tools/smart-storage/connect/connect-client.tsx`**
   - Remove the "Advanced: programmatic API keys" block (generate form, key list,
     rotate/revoke/delete, the `secret` reveal, all `/api/mcp-keys` fetches and related state).
   - Keep the OAuth "Connect to Claude" section as the sole path.
   - Update the intro copy that references keeping API keys for programmatic clients — the page
     is now OAuth-only.

5. **Config/docs**
   - Remove now-unused key config/exports if any (`lib/mcp-config.ts` — check for key-only
     helpers; leave rate-limit + OAuth config).
   - Update `docs/MCP_OAUTH_SETUP.md`: remove the "API-key clients continue to work" line;
     state the connector is OAuth-only.

6. **Database — `api_keys` table**
   - Leave the table in place (dormant, no code references) — do NOT drop it in this change.
     A later migration can drop it if desired; keeping it avoids a destructive schema change now.

## Verify (must all pass)
- `npm run build` + lint pass; no dangling imports/types from removed code.
- **OAuth still works**: the live Claude connector still connects and `smart_storage.report` /
  `export` return data (this is the critical regression check — do not break the working connector).
- A request to `/api/mcp` with `Authorization: Bearer avint_...` (an old key value) now returns
  **401** (no longer authenticates).
- The connect page renders only the OAuth flow; no key UI, no console/network calls to
  `/api/mcp-keys`.
- Grep confirms no remaining references to `resolveApiKey`, `mcp-keys`, `createApiKey`.

## Out of scope
Dropping the `api_keys` table (later, optional). No changes to OAuth, tools, gating, or rate limits.

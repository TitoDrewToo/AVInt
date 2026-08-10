# Smart Storage — MCP Connector Plan (v0)

**Company:** AVIntelligence · **Product (customer-facing name):** Smart Storage

## Goal
Expose Smart Storage's ingestion → report → export engine as an MCP connector so
Claude / Cowork users (and other plugins like Finance / Small Business) can turn
messy documents into tax-ready data **inside Claude**. Same backend, same accounts,
same plans — a new **front door**, not a bypass.

## Positioning
> Claude reads a receipt. Smart Storage keeps your books.

The connector gives Claude the three things it lacks on its own: **memory**
(a durable, structured record), **consistency** (the same deterministic,
Schedule-C-correct result every run), and **tax correctness** (defensible,
audit-ready, export-clean). Wins where the work is *real*: a whole year, hundreds
of docs, numbers that must be right and reproducible.

## Tool surface — v0 (flagship three; ship the wow first)
- `smart_storage.ingest(files[])` → messy docs in → structured, normalized,
  tax-ready records out (vendor, date, amount, currency, category, tax fields, confidence).
- `smart_storage.report(type, period)` → computed Tax Bundle / Business Expense / P&L.
- `smart_storage.export(target: "quickbooks_3col" | "quickbooks_4col" | "xero", period)`
  → clean, import-ready file (sign/date/meals traps already handled).

Fast-follow tools: `smart_storage.list(filter)`, `smart_storage.summary(period)`.

## Auth
- **Identity (unchanged):** existing Supabase auth (email + Google) stays the
  source of truth. Google/email are how the user proves who they are — untouched.
- **v0 — API key:** user logs in (email/Google), generates a key on a "Connect to
  Claude" settings page, pastes it into the connector. New backend: `api_keys`
  table (store **hash only**, scoped, revocable, listed in dashboard) + generate/revoke
  UI + validation in the MCP route. Simple, free, secure.
- **v1 fast-follow — OAuth 2.1 via a MANAGED provider (WorkOS AuthKit, free to 1M MAU),
  federated to Supabase identity** → "Connect → Sign in with Google → done", no key paste.
  Zero-vendor alternative: self-host Ory Hydra (certified OAuth 2.1), federate to Supabase.
- **NON-NEGOTIABLE:** do **not** hand-roll the MCP OAuth server. A May 2026 study of 119
  live OAuth MCP servers found DCR flaws in 96.6% of them. For a financial product,
  use a managed provider or a certified OSS server.

## Monetization / entitlements (the connector feeds the SKUs, doesn't replace them)
- Every MCP call runs through the **existing server-side entitlement metering + RLS**
  (`computeEntitlement`, `avint_claim_document_processing`, plan caps). The token is a
  front-door key, not a bypass — a user only ever touches their own data at their plan level.
- **Free-first UX:** free tier delivers the *full* magic, capped on **volume, not capability**.
  Upgrade prompts fire in-context when a real job hits the cap. "Connect to Claude" can
  itself become a Pro/Business perk later.

## Security
- API keys: high-entropy, hashed at rest, scoped, revocable, dashboard-listed.
- No data path around RLS — the connector calls the same gated edge functions/API.
- Approval required on money-touching steps (exports).

## Hosting
- Expose the MCP endpoint as a **route inside the existing avint Next app** → reuses
  auth + entitlement metering automatically; no separate service, no duplicated billing.

## Build order
1. **API-key v0 backend (Codex):** MCP route (the three tools) + `api_keys` table +
   generate/revoke UI + validation, all riding existing entitlements. Material change
   (touches auth) → Codex builds, review, approve, deploy.
2. **Plugin scaffold (Cowork plugin-creator):** wrap the connector + a couple of
   guidance skills ("prepare a tax bundle from a folder of receipts").
3. **List** in the connector / MCP registry.
4. **WorkOS OAuth fast-follow** (free): federated to Supabase, the "Sign in with Google" flow.

## Cost posture
- $0 now and for a long time: API-key v0 is self-built; WorkOS free to 1M MAU; Hydra is OSS.
- The connector's own revenue funds any future paid tier — no upfront burn required.

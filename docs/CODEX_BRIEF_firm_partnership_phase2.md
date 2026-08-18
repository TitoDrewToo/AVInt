# Codex Brief — Firm Partnership Infrastructure (Phase 2)
### Smart Storage bulk-seats channel for accounting firms

## Context & hard rules (read first)
Build the multi-tenant firm-partnership layer so a firm can: get an account + unique slug, buy
**client seats**, share a co-branded upload link with clients, and receive each client's output.

**Locked model (do not change):**
- **Bulk seats only** (no referral path).
- **One seat = one client / year. Annual only.**
- **Partner price $100 / seat / year** — keep it a **config value**, not hardcoded in UI copy.
- **Partner pricing is HIDDEN from the public `/pricing` page** — only surfaced in the partner/slug
  flow.
- **RLS is non-negotiable:** a firm can see ONLY its own clients + data. Enforce at the DB.
- Reuse existing patterns: the Creem webhook handler (`app/api/webhooks/creem/route.ts`), the
  entitlement/plan model, `_shared` logging, and the marketing component style.

Ship in sub-tasks 2a→2e; each should build, typecheck, and lint before moving on.

---

## 2a · Firm accounts + slug + firm-admin auth
- **Migration — `firms`:** `id uuid pk`, `name text`, `slug text unique` (lowercase, url-safe),
  `status text default 'active'`, `seats_purchased int default 0`, `seats_used int default 0`,
  `partner_rate_cents int default 10000`, `founding boolean default true`, `created_at`, `notes text`.
- **Migration — `firm_admins`:** `firm_id uuid fk`, `user_id uuid` (Supabase auth user), `created_at`;
  unique(firm_id,user_id). A firm admin is a Supabase auth user linked here.
- Admin onboarding for v1: an internal-only way for us to create a firm + slug + invite the firm
  admin (a protected internal route or a Supabase RPC we run). Firms don't self-serve account
  creation yet — they come through the `/for-accountants` inquiry, we provision them.
- **RLS:** `firms`/`firm_admins` readable only by their linked admins (via `firm_admins`) and
  service_role.
- **Acceptance:** we can create a firm with a unique slug and link an admin user; that admin can
  read only their own firm row.

## 2b · `/cpa/[slug]` co-branded intake + client→firm tagging + seat consumption
- **Page `app/cpa/[slug]/page.tsx`:** looks up the firm by slug; renders a co-branded intake
  ("Upload your receipts for {firm.name}"), firm logo if present. 404 on unknown/inactive slug.
- **Migration — `firm_clients`:** `id`, `firm_id fk`, `user_id uuid` (the client's Smart Storage
  user), `created_at`, `seat_consumed boolean default true`, unique(firm_id,user_id).
- When a client signs up / first uploads via a firm slug, associate them to the firm in
  `firm_clients` and **increment `firms.seats_used`** atomically.
- **Enforce the seat limit:** block new client enrollment when `seats_used >= seats_purchased`
  (show "this firm's seats are full — contact your firm"). Use an atomic RPC (guard against races,
  mirror the `avint_claim_report_export` atomic pattern).
- The client's own experience/entitlement = Pro-equivalent access for the year (seat-funded), so
  they don't hit the individual paywall while enrolled.
- **RLS:** a client row visible to the client themselves + the firm's admins + service_role.
- **Acceptance:** enrolling a client via `/cpa/[slug]` tags them to the firm, consumes a seat, and
  is blocked once seats are full.

## 2c · Seat purchase via a HIDDEN Creem seat product + webhook
- **Creem (manual dashboard step, document it):** create a **seat product** priced $100, seat/unit
  based, **not linked from public pricing**. Put its product id in an env var
  (`CREEM_FIRM_SEAT_PRODUCT_ID`).
- **Purchase flow:** a firm-admin action to buy/add N seats → create a Creem hosted checkout for
  the seat product with `units = N` and metadata `{ firm_id }`. (Follow Creem's seat-based billing:
  total = base × units.)
- **Webhook:** extend the Creem webhook handler to, on successful seat purchase, **increment
  `firms.seats_purchased` by the units** and record the transaction. Idempotent on event id (reuse
  `processed_webhook_events`).
- **Acceptance:** a seat purchase increments `seats_purchased`; re-delivered webhooks don't double
  count.

## 2d · Firm dashboard — clients, seats, output routing
- **Page `app/cpa/[slug]/dashboard` (or `/studio`-style), gated to that firm's admins:**
  - Seats **used / remaining**; a "buy more seats" button (2c).
  - Enrolled clients list.
  - **Output routing:** for each client, let the firm **download that client's Schedule C CSV +
    audit-evidence ZIP** (the core value). Reuse the existing report/export generation; scope the
    query to the firm's clients only.
- **RLS/authorization:** every query scoped to `firm_id` via `firm_admins`; a firm admin can never
  read another firm's clients or any non-enrolled user's data.
- **Acceptance:** a firm admin sees only their enrolled clients and can download only those clients'
  outputs; seats used/remaining is accurate.

## 2e · RLS + security review pass
- Verify RLS on `firms`, `firm_admins`, `firm_clients`, and that firm-scoped access to documents/
  reports cannot leak across firms or to non-enrolled users.
- Run the security-review checklist; confirm no endpoint returns cross-firm data.
- **Acceptance:** a written check that firm A cannot read firm B's clients/outputs by any route.

---

## Dependencies / decisions to confirm before/while building
- **Creem seat product** must be created in the dashboard (2c) — hidden from public pricing.
- **Firm logo / co-brand assets:** allow a logo URL on the `firms` row for 2b (optional field).
- **Firm-admin auth:** Supabase magic-link/invite for the linked admin user (confirm the invite
  mechanism to reuse).
- **Client entitlement while seat-enrolled:** confirm how a seat grants Pro-equivalent access for
  the year without the individual paywall (entitlement override keyed on `firm_clients`).
- Keep `$100` and seat rules in config so the future individual price rise (to $120) and the
  partner rate lock don't require code edits.

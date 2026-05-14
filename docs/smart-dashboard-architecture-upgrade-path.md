# Smart Dashboard — Advanced Analytics Upgrade Path

**Status:** Architecture analysis. Not a commitment to build. Not all phases are required to ship; selectively adopt as triggers warrant.
**Scope:** Smart Dashboard, advanced analytics, Context Summary, R&D widgets. Excludes Smart Storage reports (Tax Bundle, P&L, etc.), which read `document_fields` directly and must not be disturbed.
**Date created:** 2026-05-12.

---

## Thesis

The problem with Smart Dashboard analytics today is **not the storage model** (Postgres + JSONB is correct and adequate). The gap is a **principled aggregation layer**. Every dashboard load re-aggregates raw `document_fields` rows on the client. Every edge function (`/generate-context-summary`, `/generate-advanced-analytics`) re-aggregates from raw rows independently — duplicate logic, drift risk, repeated cost. `user_analytics_profile` is a half-built rollup snapshot that is populated but mostly unrendered. The eventual answer is a `dashboard_facts` layer with bounded `dimensions jsonb` and `source jsonb`. The interim answer is a set of code-only wins that get most of the correctness and observability benefit without any schema changes.

This doc captures the full upgrade path and clearly partitions:

- **Phase 0** — wins that require **no schema changes**. Pure code. Ship today if desired.
- **Phase 1** — additive constraints / safety. Minor `ALTER TABLE` migrations on `advanced_widgets`. Low risk.
- **Phase 2** — facts layer scaffold. Real schema work. Build only when triggers (below) are met.
- **Phase 3+** — full cutover of dashboard + edge functions to facts. Bigger lift.

Smart Storage reports are **not migrated** by any phase. They continue to read `document_fields` directly.

---

## Top correctness & observability risks (independent of phase)

These are real today and worth fixing regardless of whether the facts layer ever ships:

1. **`raw_json` selected in dashboard hot path with no GIN index.** `app/tools/smart-dashboard/page.tsx:1478` selects the full `raw_json` blob on every dashboard load. No GIN index exists. Only `/generate-rd-analytics` legitimately needs `raw_json` (samples 30 docs per `supabase/functions/generate-rd-analytics/index.ts:186-201`). Remove from dashboard select.
2. **`advanced_widgets.config` has zero server-side validation.** `widget_type` is `text` with no CHECK constraint (`supabase/migrations/20260331_advanced_widgets.sql:5-16`). The `RdWidgetConfig` shape at `lib/smart-dashboard.ts:20-28` is enforced only in client TypeScript — nothing prevents a hallucinated LLM output from being persisted as a malformed widget. Both `/generate-advanced-analytics` and `/generate-rd-analytics` INSERT model output unvalidated.
3. **No "still processing" signal in the dashboard.** `app/tools/smart-dashboard/page.tsx:1480` excludes only `normalization_status = 'excluded'` rows. A user uploading at T+0 sees partial totals at T+30s presented as ground truth. Contradicts the observability-first principle.
4. **Aggregation duplication across edge functions.** `/generate-advanced-analytics` (`index.ts:207-226`) and `/generate-context-summary` (`index.ts:214-216`) each pull overlapping slices and build their own rollups in TypeScript. Same logic, two implementations, drift risk.
5. **Currency conversion happens at read time on the client.** `lib/fx.ts:63-91` + `buildCurrencyModel` (called from `app/tools/smart-dashboard/page.tsx:1499`). If FX backfill is mid-flight, the dashboard races. Should happen at aggregation time in one place.
6. **`user_analytics_profile` is a Schrödinger table.** Rollup fields (`top_vendors`, `monthly_deltas`, `discount_events`, `income_sources`, `tax_timeline`) are populated but mostly unrendered. Doing two unrelated jobs at once: readiness signature (well-fit) + analytics rollups (mis-fit; should live in `dashboard_facts` eventually).

---

## Phase 0 — Code-only wins (NO schema changes)

Ship these without any `ALTER TABLE`. They address most of the **safety + correctness + observability** gap without touching the schema.

### 0.1 Stop reading `raw_json` in dashboard hot path
- File: `app/tools/smart-dashboard/page.tsx:1478`
- Change: remove `raw_json` from the SELECT list.
- Side effects: none. Dashboard does not render `raw_json`. Only `/generate-rd-analytics` consumes it, and that function does its own SELECT.

### 0.2 Server-side Zod validation of LLM widget output
- Files: `supabase/functions/generate-advanced-analytics/index.ts:539-548`, `supabase/functions/generate-rd-analytics/index.ts` (R&D widget insert path)
- Change: define a Zod schema per supported `widget_type` (`'rd-insight'`, `'line-chart'`, `'area-chart'`, `'bar-chart'`, `'pie-chart'`, `'stacked-bar'`, ...). Validate the model output before INSERT. On failure: structured log (per `feedback_observability_first`), reject the widget, don't fall back to a default-shaped row.
- Schemas live next to `lib/smart-dashboard.ts:20-28` to keep type contract in one place.
- This is the **single highest-leverage fix** in the system. AI-generated widget config reaches the DB unvalidated today.

### 0.3 "Documents still processing" banner
- File: `app/tools/smart-dashboard/page.tsx` (banner area, near existing mixed-currency banner at lines 2503-2506)
- Change: count `files` rows where `upload_status IN ('uploaded','pending_scan','scanning','approved','processing','normalized')` for the current user, but `document_fields.normalization_status` is still `'raw'` or NULL. If > 0, render a banner: "N documents still normalizing — totals may shift in a moment."
- Pairs with existing mixed-currency banner. Both surfaced from the same banner area.
- DQ-flag idea: codify a small `aggregateDataQuality(fields, files)` helper in `lib/smart-dashboard.ts` returning `{stillProcessing, mixedCurrencies, unconvertedCount, lowConfidenceCount}`. Banners render from this struct.

### 0.4 Centralize aggregation in a single shared module
- File (new): `lib/dashboard-aggregator.ts` (or extend `lib/smart-dashboard.ts`)
- Purpose: one function `aggregateDocumentFields(fields, options)` that returns the canonical rollup shape used by:
  - `app/tools/smart-dashboard/page.tsx` (replaces inline `buildCurrencyModel` work)
  - `supabase/functions/generate-context-summary/index.ts` (replaces its in-function TS aggregation)
  - `supabase/functions/generate-advanced-analytics/index.ts` (Haiku spec input)
- Output shape mirrors what `dashboard_facts.dimensions` would carry in Phase 2 — designed forward-compatible.
- Kills the drift risk between the three current implementations.
- Important: this is a **library module**, not a stored function. Edge functions import the same TS module. No DB changes.

### 0.5 Currency conversion inside the centralized aggregator
- Files: `lib/fx.ts:63-91`, the new `lib/dashboard-aggregator.ts`
- Change: aggregator owns FX. Reads `fx_rates`, applies conversions during rollup, returns rollups in original currency AND user's primary currency. Counts `unconvertedRows` per bucket as a DQ flag.
- Dashboard reads aggregator output (already converted). Client-side `buildCurrencyModel` work disappears.
- Edge functions get pre-converted rollups in their input payload — no FX work inside Haiku/Sonnet prompts.

### 0.6 De-dup `user_analytics_profile` reads
- Today the profile is upserted only when `/generate-advanced-analytics` runs (`index.ts:558-562`) and only for R&D users. The `last_run_signature` field (`supabase/migrations/20260420_user_analytics_profile_signature.sql:13-17`) IS consumed in the dashboard at `app/tools/smart-dashboard/page.tsx:1562-1569` for readiness gating.
- No-schema option: keep using `user_analytics_profile` for readiness only. Don't add new consumers. Defer the "split into facts" decision to Phase 5.

### What Phase 0 buys you
- Safer LLM-to-DB writes (no malformed widget configs ever land).
- A clear "documents still processing" affordance, removes silent partial-total problem.
- One canonical aggregation, removes drift between three implementations.
- One canonical currency conversion, removes the FX race.
- Dashboard hot path drops `raw_json` — small but real perf and clarity win.
- All achievable with **zero migrations**.

### What Phase 0 does NOT buy you
- Faster client-side renders. The dashboard still re-aggregates from raw on every load (just via the new shared aggregator instead of inline code).
- Pre-computed historical rollups. Context Summary and Haiku spec calls still process raw rows on every invocation.
- O(1) drilldowns. Time-grain toggles still re-aggregate.
- Per-period historical analytics (anomaly vs prior periods, etc.). Requires persisted facts to be efficient.

---

## Phase 1 — Additive schema constraints (low-risk migrations)

These are **small `ALTER TABLE` migrations** that complement Phase 0 without changing query patterns. Useful but optional; Phase 0 already addresses correctness.

### 1.1 `advanced_widgets.config_version`
- Migration: `ALTER TABLE advanced_widgets ADD COLUMN config_version smallint NOT NULL DEFAULT 1`.
- Every persisted row knows which schema it was written under. Renderer routes on this.

### 1.2 `widget_type` CHECK constraint
- Migration: `ALTER TABLE advanced_widgets ADD CONSTRAINT widget_type_valid CHECK (widget_type IN (...))`.
- Closed value set prevents AI-generated rows from arriving with novel widget types the renderer doesn't know about. Pairs with Phase 0.2 Zod validation as defense in depth.

### 1.3 Bound `advanced_widgets.config` size
- Migration: `ALTER TABLE advanced_widgets ADD CONSTRAINT config_size_bounded CHECK (octet_length(config::text) < 32768)`.
- Prevents accidental megablob. 32 KB is conservative for transformed R&D rollups.

### 1.4 Optional: promote validated `raw_json` keys
- Only if a specific key proves load-bearing in production. Candidates:
  - `transaction_time` → typed `transaction_at timestamptz` with partial index.
  - `branch`, `location` → typed if merchant enrichment expands.
- Each promotion is a single `ALTER TABLE` + a normalization function update + a one-time backfill.

---

## Phase 2 — Facts layer scaffold (real schema work)

**Only invest when one of the trigger conditions below is true.** Don't build speculatively.

### Trigger conditions (any one is enough)
- Dashboard load time on representative users exceeds ~1.5s due to client-side aggregation.
- Edge function token budgets (Haiku for spec generation, Haiku for summary) hit ceilings due to repeated raw-row processing.
- Drilldown latency becomes user-noticeable on time-grain toggles.
- New R&D angles want historical period comparisons (anomaly vs prior 6 months) that are inefficient over raw rows.
- A second product surface (mobile, public report viewer, API) needs the same aggregates.

### Proposed shape
```
dashboard_facts (
  user_id           uuid NOT NULL
  period_grain      text NOT NULL              -- 'month' | 'week' | 'day'
  period_start      date NOT NULL
  period_end        date NOT NULL
  document_type     text NOT NULL
  primary_currency  text NOT NULL              -- user's dashboard currency at compute time

  sum_income_primary    numeric(14,2)
  sum_expense_primary   numeric(14,2)
  sum_tax_primary       numeric(14,2)
  sum_discount_primary  numeric(14,2)
  net_primary           numeric(14,2)
  document_count        int
  normalized_count      int
  pending_count         int

  dimensions    jsonb NOT NULL DEFAULT '{}'    -- bounded; top vendors, top categories, currencies, employers
  source        jsonb NOT NULL DEFAULT '{}'    -- drilldown: { file_ids: [...], field_ids: [...] }
  dq_flags      jsonb NOT NULL DEFAULT '{}'    -- mixed_currency, unconverted_rows, low_confidence_count, ...

  config_version smallint NOT NULL DEFAULT 1
  refreshed_at   timestamptz NOT NULL DEFAULT now()

  PRIMARY KEY (user_id, period_grain, period_start, document_type, primary_currency)
)
```

### Why real table, not materialized view
- **Refresh granularity.** Real table allows per-user, per-bucket refresh on document upload. Materialized views refresh whole-MV.
- **Triggers as the contract.** `AFTER INSERT/UPDATE/DELETE ON document_fields` → call `refresh_dashboard_facts(user_id, affected_bucket)`. Predictable; pairs with existing edge function patterns.
- **Index flexibility.** Real table can carry whatever indexes the consumers need (e.g., partial index for active periods).

### Trade-off honesty
- Adds: trigger, refresh function, backfill function, RLS policies, monitoring.
- Saves: client-side aggregation cost, edge function aggregation cost, drilldown re-aggregation cost.
- Net positive only when trigger conditions are real. Premature if Phase 0 hasn't shipped yet.

### Forward-compatible design rule
The output shape from Phase 0.4's `aggregateDocumentFields()` library function should be **the same shape as `dashboard_facts.dimensions`**. When Phase 2 ships, the library function becomes a thin wrapper around the facts query — no consumer-side changes needed.

---

## Phase 3 — Cutover edge functions to facts

Only after Phase 2 lands and parity is verified.

- `/generate-context-summary` reads `dashboard_facts` for aggregates. Keeps raw `document_fields` access only if it needs line-item-level detail not in facts.
- `/generate-advanced-analytics` (Haiku) reads `dashboard_facts.dimensions` for its dimensional inventory.
- `/generate-rd-analytics` (Sonnet) keeps raw + `raw_json` access — R&D needs row-level. Reads facts only for de-dup against Haiku angles.

Side benefit: Haiku prompts get smaller and more deterministic. Cost per call drops.

---

## Phase 4 — Cutover dashboard client to facts

Big PR. Touches `app/tools/smart-dashboard/page.tsx`.

- Replace `aggregateDocumentFields()` library call with direct `dashboard_facts` query for the current period range.
- Time-grain toggles become facts queries at different `period_grain` values, not client re-aggregation.
- Drilldowns: read `facts.source.file_ids` for the bucket, fetch full `document_fields` rows on-demand only at drill moment.
- DQ banner: read from `facts.dq_flags`, not client-side computation.
- Currency: facts already in `primary_currency`; mixed-currency banner becomes an inventory observation.

Behind a feature flag for one release in case of regressions.

---

## Phase 5 — Reap & extend

- Split `user_analytics_profile`: keep `last_run_signature` + `last_run_at` for readiness; move analytics rollup fields out — they're redundant with `dashboard_facts.dimensions` once Phase 4 ships, or keep them as a renamed `user_analytics_signature` table.
- New R&D angles: each one becomes "add a `dimensions` key" or "add a typed rollup column." Additive.
- Per-bucket anomaly flags computed during refresh; surfaced via new `dq_flags.anomaly_kind` values.
- If trigger latency becomes a concern at scale: move refresh enqueueing to a background worker (pg_cron + pg_net polling a queue table, or a dedicated edge function).

---

## What stays out (across all phases)

- **`document_fields` schema is unchanged** except for additive promotions of validated `raw_json` keys.
- **Smart Storage reports are untouched.** Tax Bundle, Business Expense Report, P&L all keep their current query patterns against `document_fields`.
- **`/api/reports/**`, `/app/reports/**` — not modified.**
- **`files.upload_status` state machine — unchanged.**
- **Cross-product enums (`normalization_status`, `expense_category`, `income_source`, `document_type`)** — modified only if both products' owners agree.

---

## JSONB discipline (cross-cutting; enforce regardless of phase)

To prevent `dashboard_facts.dimensions` from becoming the next `raw_json`:

1. **Promotion rhythm.** Any JSONB key read by >1 hot path → typed column in the next migration.
2. **Schema gates at write time.** Every JSONB field has a server-side Zod schema enforced before INSERT/UPDATE. No exceptions for LLM output.
3. **Size bounds.** Hard `CHECK (octet_length(field::text) < N)` constraints. Defaults: `dimensions` ≤ 16 KB, `source` ≤ 32 KB, `dq_flags` ≤ 4 KB, `advanced_widgets.config` ≤ 32 KB, `document_fields.raw_json` ≤ 64 KB.
4. **Index discipline.** A JSONB key entering a `WHERE` clause arrives with its own index in the same PR.
5. **Quarterly audit.** Grep all `field->>'key'`, `field @>`, JSONB filter patterns. Each one either has an index or has a written justification.

---

## Open decisions (deferred to phase-2 work)

- Per-period DQ tracking granularity (per-bucket DQ flags vs per-row).
- Trigger-direct refresh vs queued refresh (latency / scale trade-off).
- Partition strategy for `dashboard_facts` if user count grows (per-user vs per-period RANGE partitioning).
- How `dashboard_facts` relates to a future shared facts layer for mobile / public API surfaces.

---

## Recommendation summary

- **Ship Phase 0 when time allows.** It's pure code, low risk, addresses the highest-leverage correctness and observability issues (especially 0.2 server-side Zod validation of widget config). Doesn't require committing to the rest of the path.
- **Defer Phase 1 unless an incident motivates it.** The `config_version` and CHECK constraints are good hygiene but redundant with Phase 0.2 unless we see a multi-version widget rollout.
- **Defer Phase 2+ until trigger conditions are met.** Building the facts layer speculatively burns weeks for hypothetical wins. Build when the dashboard actually feels slow, or when edge function token costs become painful.
- **Phase 0.4's library design matters disproportionately.** If `aggregateDocumentFields()` returns the same shape that `dashboard_facts.dimensions` would eventually carry, the eventual Phase 2 cutover is a one-day refactor instead of a one-week one.

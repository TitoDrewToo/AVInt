# Smart Dashboard — Phase 0 Action Plan

**Reference architecture:** `docs/smart-dashboard-architecture-upgrade-path.md`
**Scope:** Phase 0 only — code-only wins, **zero schema changes**, no migrations.
**Out of scope (deferred to Phase 1+):** `config_version` / CHECK constraints on `advanced_widgets`, `dashboard_facts` table, `user_analytics_profile` restructuring, `raw_json` key promotions.
**Untouched throughout:** Smart Storage report code (`app/tools/smart-storage/reports/**`, `app/reports/**`, `app/api/reports/**`), Tax Bundle math, report PDFs, any non-dashboard surface.

---

## Two batches, ship in order

Phase 0 splits into two batches because the safety/observability work is independent from the aggregation refactor. Splitting them keeps each PR small, reviewable, and trivially revertible. Batch 1 ships first; Batch 2 follows after Batch 1 is reviewed.

### Batch 1 — Safety + Observability (this action plan's first Codex brief)

**Goal:** Plug the highest-leverage correctness and observability gaps without touching the aggregation path.

**Items:**

#### B1.1 — DEFERRED to Batch 2 (was: Drop `raw_json` from dashboard hot path)
- **Status:** Moved to Batch 2 on 2026-05-12 after Codex verification found a hidden client-side consumer.
- **Hidden consumer:** `lib/smart-dashboard.ts:232` reads `raw_json.gemini_raw.document_type` as a fallback inside `classifyRow` (line 237) when `files.document_type` doesn't resolve a row to income or expense. Removing `raw_json` from the SELECT would silently misclassify any row depending on that fallback.
- **Why defer rather than fix in Batch 1:** Batch 2 centralizes aggregation into `lib/dashboard-aggregator.ts`. `classifyRow` either moves into that module or gets refactored. That's the right moment to choose between: (a) narrow the SELECT via PostgREST jsonb-path alias (`raw_json->gemini_raw->document_type`), (b) promote `gemini_raw.document_type` to a typed `document_fields.extracted_document_type` column with backfill (this is a schema change — would move into Phase 1+), or (c) audit usage and remove the fallback if it's no longer load-bearing.
- **Today's mitigation:** The consumer reads exactly one JSONB path, not the full blob. Wire cost is the concern, not query cost. Acceptable to keep as-is until Batch 2.

#### B1.2 — Server-side Zod validation of LLM widget output
- **New file:** `supabase/functions/_shared/widget-schemas.ts`
  - Zod schemas for:
    - `WidgetTypeSchema` — closed enum of allowed `widget_type` values currently produced by either edge function (read the actual edge function code to enumerate; do not invent values).
    - `RdWidgetConfigSchema` — mirror `RdWidgetConfig` from `lib/smart-dashboard.ts:20-28` exactly: `source`, `angle`, `chart_type`, `data`, `x_key`, `data_key`, `currency`. Reject extra keys.
    - `HaikuSpecOutputSchema` — the shape Claude Haiku returns in `/generate-advanced-analytics` before transformation into an INSERT row. Read the actual function to derive the schema.
    - `SonnetRdOutputSchema` — the shape Claude Sonnet returns in `/generate-rd-analytics` before transformation into an INSERT row. Read the actual function to derive the schema.
    - Common bounded fields: `title` (string, 1–120 chars), `description` (string, 1–500), `insight` (string, 1–800).
- **Modified files:**
  - `supabase/functions/generate-advanced-analytics/index.ts` — validate the LLM JSON response against `HaikuSpecOutputSchema` BEFORE constructing the INSERT row. On validation failure: structured log via existing `_shared/log.ts` (`logError` or equivalent) with the validation error details (field path + reason; truncate any field value to 200 chars to keep logs readable), then SKIP the bad widget (don't INSERT a partial/default-shaped row). Continue processing remaining widgets if the function returns multiple.
  - `supabase/functions/generate-rd-analytics/index.ts` — same pattern: validate Sonnet output against `SonnetRdOutputSchema` BEFORE INSERT. On failure: structured log + skip. For successful validations, also validate the constructed `config` payload against `RdWidgetConfigSchema` before INSERT as defense-in-depth.
- **Logging requirements:**
  - Structured failure log must include: `user_id`, function name, `widget_type` if extractable, the Zod issue tree (path + message), and a short truncated sample of the offending payload.
  - Do NOT log full LLM output — only the offending fields. Bounded length.
- **Out of scope:** `/generate-context-summary` validation (different output shape, lower stakes; deferred to Batch 2 alongside aggregation work).

#### B1.3 — "Documents still processing" banner
- **File:** `app/tools/smart-dashboard/page.tsx` (banner area near the existing mixed-currency banner around lines 2503–2506)
- **Data source:** Use data the dashboard already loads. Count `files` rows where:
  - `upload_status` ∈ `{'uploaded', 'pending_scan', 'scanning', 'approved', 'processing'}` (i.e., not yet `'normalized'`/`'done'`/`'quarantined'`)
  - OR matching `document_fields` row exists but `normalization_status` ∈ `{'raw', null}` (i.e., extracted but not normalized)
- **Render rule:** If count > 0, render a banner: `"N documents still processing — totals may shift in a moment."` Style consistent with the existing mixed-currency banner (same visual treatment).
- **Behavior:** Re-evaluates whenever dashboard data reloads. No new query needed; derive from existing data.
- **Out of scope:** Auto-refresh polling, real-time updates. Banner is point-in-time; user-triggered reload refreshes it.

**Batch 1 closure criteria:**
1. `npm run typecheck` (or repo equivalent) passes.
2. Zod validation present in both edge functions; rejected widgets are logged and skipped, not silently defaulted.
3. Still-processing banner renders in the dashboard when applicable.
4. No schema changes, no migrations, no `supabase/migrations/**` edits.
5. No edits to Smart Storage report code, Tax Bundle, or any non-dashboard surface.
6. `raw_json` SELECT and `classifyRow` fallback remain unchanged (deferred to Batch 2).
7. Codex writes a report at `docs/smart-dashboard-phase-0-batch-1-report.md`.

### Batch 1.7 — R&D widget chart-type switcher fix (in flight)

**Goal:** Make the pie/bar/area/line chart type switcher work for R&D widgets (`widget_type = 'rd-insight'`), matching Haiku spec widget behavior.

**Problem:** R&D widget renderer at `app/tools/smart-dashboard/page.tsx:724-744` branches on `rd.chart_type` (baked into stored config), not `widget.chartVariant` (local UI state set by the switcher). Switcher updates state and persists to `dashboard_layouts`, but the chart never redraws.

**Fix:** Single-file change to `page.tsx`. Derive `effectiveChartType = variantToChartType(widget.chartVariant) ?? rd.chart_type` and branch on that. Override-of-record: `chartVariant` persisted in `dashboard_layouts.layout.widgets` wins over Sonnet's original `rd.chart_type`. Existing `CHART_TYPE_OPTIONS` in `lib/smart-dashboard.ts:154-159` already enforces data-safe swap pairs (pie↔bar, area↔bar↔line); no widening.

**Closure criteria:**
1. R&D widgets respond to switcher clicks with re-render.
2. Saved variant persists across page reloads.
3. Haiku spec widget rendering paths unchanged.
4. No schema, no edge functions, no other file edits.

### Batch 1.8 — Categorical drilldown to document list

**Goal:** Click a slice/bar/stack on a composition chart → open a modal showing the underlying `document_fields` rows that contributed to that bucket.

**Scope of v1 (this batch):**
- Pie-chart composition widget (`app/tools/smart-dashboard/page.tsx:900-918`) — click slice → drill by `expense_category` or `document_type` (whichever the chart is rendering).
- Bar-chart composition widget (`page.tsx:850`) — click bar → same.
- Stacked composition widget (`page.tsx:956`) — click stack segment → drill by `expense_category` or `merchant_domain` (per `stackedComposition.groupBy`).
- Document Distribution (`docTypeData`) drilldown by `files.document_type`.

**Out of scope for v1 (deferred to Batch 2 or later):**
- R&D widget drilldown — needs source IDs from facts layer; defer to Batch 2.
- Time-series drilldown by period — temporal drilldown already exists; "click a month → see receipts in that month" is a different mechanic and not part of v1.
- Cross-entity drilldown (vendor↔category↔period) — Constellation 3D territory, much later.
- Server-side pagination — in-memory filtering of `dashboardRows` is fine for v1 since the dashboard already has these rows loaded.
- Deep linking / URL-preserved drilldown state — defer.
- "Open in Smart Storage" link from a drilled row — defer to v2 if needed; v1 shows file info without navigation.

**Implementation shape:**
- New `DrilldownModal` component (inline in `page.tsx` to match existing convention — `DashboardColorPicker`, `ChartVariantPicker`, `ReadinessHint` are all inline).
- New page state: `const [drilldown, setDrilldown] = useState<{ bucket: 'expense_category' | 'document_type' | 'merchant_domain'; key: string; label: string } | null>(null)`.
- Click handlers on `Pie`, `Bar`, and stacked bar segments → set drilldown state.
- Filter `dashboardRows` client-side based on drilldown bucket + key; pass filtered rows to modal.
- Modal displays: file name, document_date, vendor_name or counterparty_name, total_amount + currency, document_type. Sort by amount desc.
- Modal dismisses via close button or backdrop click.

**Closure criteria:**
1. Click a slice on the pie composition widget → modal opens showing relevant `document_fields` rows.
2. Same for bar composition and stacked composition.
3. Modal closes cleanly; no state bleed when reopening on a different category.
4. No schema changes, no new Supabase queries (use in-memory `dashboardRows`).
5. Typecheck passes.

### Batch 2 — Aggregation centralization (next Codex brief, drafted after Batch 1 review)

**Goal:** Replace three independent aggregation implementations with one canonical library function. Move currency conversion into the aggregator. Forward-compatible with a future `dashboard_facts.dimensions` shape.

**Items (preview):**

- B2.1 — New `lib/dashboard-aggregator.ts` exposing `aggregateDocumentFields(fields, options)`. Returns rollups + DQ flags + currency-converted totals + bounded `dimensions`-shape payload.
- B2.2 — Migrate `app/tools/smart-dashboard/page.tsx` to consume the aggregator output. Removes inline `buildCurrencyModel`-style work.
- B2.3 — Migrate `/generate-context-summary` to consume the aggregator (where possible — context summary may keep line-item access for narrative detail).
- B2.4 — Migrate `/generate-advanced-analytics` to consume the aggregator's dimensional inventory.
- B2.5 — Move FX conversion (`lib/fx.ts:63-91`) into the aggregator's compute path. Output rollups in user's primary currency with `unconvertedRows` count in DQ flags.
- B2.6 — Address the `raw_json` wire cost from deferred B1.1. During aggregator design, `classifyRow` either moves into the new module or is refactored. Pick one: (a) narrow the SELECT via PostgREST jsonb-path alias (`raw_json->gemini_raw->document_type`) — keeps current behavior, drops blob from wire; or (b) audit gemini fallback usage and remove it if no longer load-bearing; or (c) flag the field for typed promotion in Phase 1+ (schema change, would exit Phase 0 scope).

Batch 2 is its own brief, drafted after Batch 1's report lands. Items are listed here for visibility only.

---

## What ships without Codex

Nothing. All items above are code work routed through Codex (or whatever external implementer the founder chooses to assign the brief to).

## What stays out of all Phase 0 work

- Migrations / `ALTER TABLE` / schema changes of any kind.
- New tables, materialized views, triggers, stored functions.
- `dashboard_facts` work.
- `user_analytics_profile` restructuring.
- `raw_json` key promotion to typed columns.
- Any modification to Smart Storage reports, Tax Bundle, report-generation routes, or report PDFs.
- Auto-deploy of edge functions (founder owns deploys; remember `--no-verify-jwt` per `CLAUDE.md`).
- Git commits or merges.

## Validation strategy

No QA or test passes in plan per founder workflow preference. Validation = typecheck + structured logs + post-deploy observation. If a regression surfaces in production logs (Zod rejections spiking, banner appearing on already-normalized data, etc.), it gets triaged in a follow-up brief — not pre-emptively in-plan.

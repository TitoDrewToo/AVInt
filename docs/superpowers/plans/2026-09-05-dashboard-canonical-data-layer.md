# Smart Dashboard Canonical Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Smart Dashboard visuals refresh from canonical records or datasets through the same validated, currency-safe data contract used by Smart Storage reports.

**Architecture:** Keep the existing dashboard renderers, but add a declarative visual definition describing source, scope, period, filters, dimension, and metric. Execute definitions server-side against owned canonical records/datasets, persist only validated definitions, and return bounded rendered series to the dashboard and MCP.

**Tech Stack:** Next.js 16, TypeScript, Supabase/Postgres, Supabase Edge Functions, MCP, Recharts.

---

### Task 1: Correct advanced aggregate contracts

**Files:**
- Create: `supabase/migrations/20260905020000_dashboard_canonical_analytics.sql`
- Modify: `supabase/functions/generate-advanced-analytics/index.ts`
- Test: `scripts/test-dashboard-canonical-mappings.ts`

- [ ] **Step 1: Write failing migration-contract assertions**

Assert every aggregate excludes `excluded_at`, offers a currency-scoped overload, and exposes typed attribute aggregation.

- [ ] **Step 2: Run the contract test and verify failure**

Run: `npx tsx scripts/test-dashboard-canonical-mappings.ts`
Expected: FAIL because the repair migration does not exist.

- [ ] **Step 3: Add minimal forward migration**

Create security-definer functions with fixed `search_path`, owner checks through `p_user_id`, root-record filtering, `excluded_at is null`, date bounds, and optional currency scope.

- [ ] **Step 4: Port advanced analytics to the repaired functions**

Select a dominant currency explicitly, calculate only that currency, and populate tax/payment/income-source/jurisdiction/discount signals from `record_attributes` rather than placeholder zeroes.

- [ ] **Step 5: Run contract and derivation tests**

Run: `npx tsx scripts/test-dashboard-canonical-mappings.ts && npx tsx scripts/test-derive-records.ts`
Expected: PASS.

### Task 2: Add declarative saved visual definitions

**Files:**
- Create: `lib/dashboard-visual-definition.ts`
- Create: `lib/dashboard-visual-engine.ts`
- Modify: `lib/dashboard-widget-spec.ts`
- Modify: `lib/dashboard-widget-store.ts`
- Test: `scripts/test-dashboard-visual-definitions.ts`

- [ ] **Step 1: Write definition validation and compilation tests**

Cover records and dataset sources, field validation, filters, time/category dimensions, aggregation, row limits, excluded records, and split-currency output.

- [ ] **Step 2: Run tests and verify failure**

Run: `npx tsx scripts/test-dashboard-visual-definitions.ts`
Expected: FAIL because the visual contract is absent.

- [ ] **Step 3: Implement bounded validation**

Reject SQL, expressions, unknown renderer types, invalid field names, excessive filters, excessive limits, and unsafe mixed-currency aggregation.

- [ ] **Step 4: Implement canonical execution**

Reuse the report source loader so records, attributes, datasets, folder scope, periods, filters, ownership, and row limits have one implementation.

- [ ] **Step 5: Persist definitions and return refreshed series**

Store the validated definition in `advanced_widgets.config`; list operations execute it against current data and include a bounded rendered series.

- [ ] **Step 6: Run definition tests**

Run: `npx tsx scripts/test-dashboard-visual-definitions.ts`
Expected: PASS.

### Task 3: Connect UI and MCP to the shared definition

**Files:**
- Create: `app/api/dashboard-visuals/route.ts`
- Modify: `app/api/mcp/[[...transport]]/route.ts`
- Modify: `app/tools/smart-dashboard/page.tsx`
- Modify: `lib/smart-dashboard.ts`

- [ ] **Step 1: Add authenticated visual execution route**

Return owned saved visuals with refreshed series using bearer authentication and existing report entitlements/rate limits.

- [ ] **Step 2: Expand MCP save schema**

Require a declarative definition for new MCP visuals and describe discovery through `smart_storage.virtual_model`.

- [ ] **Step 3: Load refreshed definitions in Smart Dashboard**

Use the authenticated route for generated visuals and pass the returned generic chart config into existing line, area, bar, and pie renderers.

- [ ] **Step 4: Verify types and build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS.

### Task 4: Regression verification

**Files:**
- Test: `scripts/test-dashboard-canonical-mappings.ts`
- Test: `scripts/test-dashboard-visual-definitions.ts`

- [ ] **Step 1: Run Smart Storage/report regression tests**

Run: `npx tsx scripts/test-ingest-completion.ts && npx tsx scripts/test-plan-limits.ts && npx tsx scripts/test-report-definitions.ts && npx tsx scripts/test-smart-storage-migrations.ts`
Expected: PASS.

- [ ] **Step 2: Check migration and diff hygiene**

Run: `git diff --check`
Expected: no output.

### Task 5: Add dashboard-page foundation

**Files:**
- Create: `lib/dashboard-pages.ts`
- Modify: `supabase/migrations/20260905020000_dashboard_canonical_analytics.sql`
- Modify: `app/tools/smart-dashboard/page.tsx`
- Modify: `lib/dashboard-widget-store.ts`

- [ ] **Step 1: Add owned dashboard pages**

Create a page table with Personal/Business/custom kinds, per-page layout JSON, stable slugs, ordering, RLS, and automatic Personal-page migration from the existing single layout.

- [ ] **Step 2: Scope generated visuals to a page**

Add `page_id` to saved dashboard widgets and validate that a requested page belongs to the signed-in user.

- [ ] **Step 3: Add the page-switching prototype**

Display page tabs in the dashboard toolbar, lazily ensure Personal and Business pages exist, and load/save the selected page’s independent layout.

- [ ] **Step 4: Preserve compatibility**

Keep the legacy `dashboard_layouts` row as the Personal-page migration source only; all new saves use page layouts.

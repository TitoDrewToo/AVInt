# AVIntelligence Code Hygiene Fix Pass Implementation Plan

> **For agentic workers:** Execute inline unless the user explicitly asks for subagents. Keep changes small, verify after each phase, and do not refactor working product flows without preserving current behavior.

**Goal:** Stabilize Smart Dashboard and Smart Storage polish issues, then reduce code hygiene risk without regressing working product flows.

**Architecture:** Start with observable user-facing bugs and console errors, then extract repeated/fragile logic behind narrow helpers/hooks. Avoid broad rewrites. Preserve the current Smart Storage and Smart Dashboard UX, including working document upload, reclassify, report links, multi-currency dashboard, and entitlement gates.

**Tech Stack:** Next.js App Router, React 19, Supabase client/admin APIs, Supabase Edge Functions, TypeScript strict mode, Recharts, react-grid-layout.

---

## Scope

Included:

- avintph.com product code under `app/`, `components/`, `lib/`, and `supabase/functions/`
- Smart Storage launch/preload performance and code hygiene
- Smart Dashboard console errors, saved currency-mode hydration, FX/persistence polish, and code hygiene
- Reclassify Sheet optimization boundaries, without removing the heavy workflow
- Shared edge-function/API hygiene

Excluded:

- `smart-security/`
- `paperclip/`
- `paperclip-2-news/`
- Tax Bundle summary/report internals, except where shared report route changes require not breaking routing

## Regression Guardrails

- Before edits, capture baseline:
  - `pnpm exec tsc --noEmit`
  - browser load of `/tools/smart-storage`
  - browser load of `/tools/smart-dashboard`
  - browser console errors for both pages
- After every phase:
  - `pnpm exec tsc --noEmit`
  - browser smoke for touched page
  - verify no newly introduced console errors
- Do not change database schema unless explicitly required.
- Do not change report math unless the phase specifically targets that math.
- Do not touch Tax Bundle internals in this pass.
- Keep commits phase-sized when committing is requested.

## Surfaced Items

1. Oversized Smart Dashboard page.
2. Oversized Smart Storage page.
3. Smart Dashboard browser console errors.
4. Saved merged KPI widget loads as stacked until toggled.
5. Reclassify Sheet modal is a heavy sub-app.
6. Reclassify spreadsheet workflow has optimization headroom.
7. Edge functions duplicate CORS/auth patterns.
8. `process-document` has large blast radius.
9. Client-side business logic is spread across page files.
10. Report API switchboard repeats query patterns.
11. FX layer still leaks cache/loading/persistence concerns into UI.
12. Type safety gaps around AI-extracted rows.
13. Tooling gap: `tsc` passes, `pnpm lint` currently fails because `eslint` is unavailable/config missing.

---

## Phase 0: Baseline And Triage

**Purpose:** Establish current behavior before fixing anything.

**Files:**

- Read only:
  - `app/tools/smart-dashboard/page.tsx`
  - `app/tools/smart-storage/page.tsx`
  - `components/ui/reclassify-sheet-modal.tsx`
  - `lib/smart-dashboard.ts`
  - `lib/fx.ts`
  - `lib/smart-storage-cache.ts`

**Steps:**

- [ ] Run `pnpm exec tsc --noEmit`. Expected: pass.
- [ ] Load `/tools/smart-dashboard` in browser with console capture.
- [ ] Record exact console errors, stack traces, and affected widget/page state.
- [ ] Verify saved merged KPI repro:
  - save Expense KPI as merged
  - hard refresh
  - confirm whether widget initially renders stacked
  - toggle once and confirm it aligns
- [ ] Load `/tools/smart-storage` in browser with console capture.
- [ ] Measure rough launch path:
  - session load
  - warm cache availability
  - file list render
  - processing status fetch
  - report availability fetch

**Exit Criteria:**

- Known console errors are listed.
- Saved KPI mode repro is confirmed or disproven.
- Smart Storage launch bottleneck is localized enough to fix.

---

## Phase 1: Smart Dashboard Correctness Polish

**Purpose:** Fix visible dashboard behavior before refactoring.

**Files:**

- Modify:
  - `app/tools/smart-dashboard/page.tsx`
  - possibly `lib/smart-dashboard.ts`
  - possibly `lib/fx.ts`

**Tasks:**

- [ ] Fix saved widget currency-mode hydration.
  - Ensure saved `layout.preferences.widgetCurrencyModes` supports both legacy `"split"` and current UI terms.
  - Ensure loaded widget mode drives first render before fallback defaults.
  - Confirm KPI widgets set to merged render merged immediately after refresh.
- [ ] Resolve dashboard console errors.
  - Fix root cause only after reproducing exact error.
  - Prefer guards around missing chart data, stale widget IDs, unavailable currency buckets, and async race conditions.
- [ ] Remove or gate FX debug logs:
  - `"[fx-cache] hit"`
  - `"[fx-cache] miss"`
- [ ] Keep current behavior:
  - Stacked/Merged for KPI widgets.
  - Merge toggle for chart widgets.
  - All Currencies widget remains split and conversion locked.
  - Missing-currency banner remains.

**Verification:**

- `pnpm exec tsc --noEmit`
- Hard refresh `/tools/smart-dashboard`
- No unexpected console errors.
- Saved merged KPI stays merged on initial load.
- Toggling merged/stacked does not force full dashboard reload.

---

## Phase 2: Smart Storage Launch/Preload Performance

**Purpose:** Improve tool-page launch feel without changing upload behavior.

**Files:**

- Modify:
  - `app/tools/smart-storage/page.tsx`
  - `lib/smart-storage-cache.ts`
  - possibly `components/smart-storage-prefetcher.tsx`

**Tasks:**

- [ ] Confirm whether warm cache is available before page render.
- [ ] Ensure first paint can use cached files/folders while background refresh updates stale data.
- [ ] Avoid duplicate fetches between prefetcher and page mount.
- [ ] Keep file list pagination behavior unchanged.
- [ ] Keep processing realtime refresh behavior unchanged.
- [ ] Do not alter upload, prescan, delete, folder move, or report-opening behavior unless profiling shows they are directly involved in launch slowdown.

**Verification:**

- `pnpm exec tsc --noEmit`
- Cold-ish load `/tools/smart-storage`
- Navigate away/back and confirm warm load is faster.
- Upload one small test file only if needed for smoke; otherwise avoid changing user data.
- Confirm no console errors.

---

## Phase 3: Reclassify Sheet Optimization Boundary

**Purpose:** Keep the heavy spreadsheet cleanup feature but isolate obvious waste and debug noise.

**Files:**

- Modify:
  - `components/ui/reclassify-sheet-modal.tsx`
  - possibly `supabase/functions/analyze-spreadsheet/index.ts`

**Tasks:**

- [ ] Remove or gate save-flow `console.log` statements.
- [ ] Ensure auto-analysis runs once per file open and does not duplicate on state churn.
- [ ] Ensure bulk save does not renormalize rows unnecessarily:
  - currency/category/status changes should skip renormalization where already intended.
  - field changes that affect derived values may still renormalize.
- [ ] Preserve current user flow:
  - load rows
  - show findings
  - accept/dismiss findings
  - bulk update rows
  - refresh file analysis state

**Verification:**

- `pnpm exec tsc --noEmit`
- Open Reclassify Sheet on an existing spreadsheet.
- Confirm no duplicate analysis calls.
- Accept a currency finding if available, or perform a harmless field edit only with user-approved test data.

---

## Phase 4: Extract Dashboard Helpers Without Behavior Change

**Purpose:** Reduce `app/tools/smart-dashboard/page.tsx` blast radius after correctness is stable.

**Files:**

- Create candidates:
  - `lib/dashboard-fx-state.ts` or `hooks/use-dashboard-fx.ts`
  - `lib/dashboard-preferences.ts`
- Modify:
  - `app/tools/smart-dashboard/page.tsx`
  - `lib/fx.ts`

**Tasks:**

- [ ] Extract preference serialization/deserialization:
  - primary currency
  - widget currency modes
  - palette
  - layout fallback handling
- [ ] Extract FX prepare/cache flow:
  - memory cache hit
  - DB cache hit
  - backfill call
  - rates map update
  - widget loading/error state
- [ ] Keep rendering code unchanged except for calling extracted helpers.
- [ ] Add lightweight unit-like pure function coverage if a test harness exists; otherwise rely on `tsc` and browser smoke.

**Verification:**

- `pnpm exec tsc --noEmit`
- Dashboard hard refresh with saved layout.
- Toggle KPI and chart currency modes.
- Confirm primary currency preference persists.

---

## Phase 5: Extract Smart Storage Data Hooks Conservatively

**Purpose:** Reduce `app/tools/smart-storage/page.tsx` size around data loading, not interaction-heavy UI.

**Files:**

- Create candidates:
  - `hooks/use-smart-storage-data.ts`
  - `hooks/use-smart-storage-processing.ts`
- Modify:
  - `app/tools/smart-storage/page.tsx`
  - `lib/smart-storage-cache.ts`

**Tasks:**

- [ ] Extract session-bound data load orchestration:
  - files page
  - folders
  - processing state
  - report availability
  - warm cache update
- [ ] Keep pointer/drag/select UI code in the page for now.
- [ ] Keep upload flow in page unless Phase 2 shows upload contributes to launch slowdown.

**Verification:**

- `pnpm exec tsc --noEmit`
- Smart Storage load, folder nav, classification nav, file selection, and report open smoke.

---

## Phase 6: Shared Edge Function Hygiene

**Purpose:** Reduce duplicated CORS/auth/provider patterns without changing function behavior.

**Files:**

- Create candidates:
  - `supabase/functions/_shared/cors.ts`
  - `supabase/functions/_shared/auth.ts`
- Modify gradually:
  - `supabase/functions/fx-backfill/index.ts`
  - `supabase/functions/analyze-spreadsheet/index.ts`
  - `supabase/functions/generate-context-summary/index.ts`
  - `supabase/functions/generate-advanced-analytics/index.ts`
  - `supabase/functions/generate-rd-analytics/index.ts`
  - `supabase/functions/prescan-document/index.ts`
  - `supabase/functions/process-document/index.ts`

**Tasks:**

- [ ] Extract `buildCorsHeaders(req)` with same allowed-origin behavior.
- [ ] Extract user-JWT validation helper where functions accept authenticated browser calls.
- [ ] Do not alter provider model choices or fallback order in this phase.
- [ ] Deploy only if edge function changes are made and user confirms deployment timing.

**Verification:**

- Local type/deno check if available.
- Browser calls still pass CORS.
- Edge responses include CORS on success and error.

---

## Phase 7: Document Pipeline Risk Reduction

**Purpose:** Reduce `process-document` blast radius only after user-visible bugs are fixed.

**Files:**

- Create candidates:
  - `supabase/functions/process-document/spreadsheet.ts`
  - `supabase/functions/process-document/extraction.ts`
  - `supabase/functions/process-document/currency.ts`
- Modify:
  - `supabase/functions/process-document/index.ts`

**Tasks:**

- [ ] Extract pure spreadsheet helpers first:
  - header mapping fallback
  - row garbage filtering
  - date/number/currency normalization
  - currency inference
- [ ] Keep request handler, auth, DB writes, and normalization chain in `index.ts`.
- [ ] No behavior changes except preserving current logs and outputs.

**Verification:**

- Re-run known spreadsheet fixture processing in a safe environment if available.
- Confirm document_fields output shape remains compatible with dashboard/reclassify.

---

## Phase 8: Type Boundary Hardening

**Purpose:** Reduce `any` around AI-extracted rows without trying to perfectly type the world.

**Files:**

- Modify:
  - `lib/smart-dashboard.ts`
  - `lib/fx.ts`
  - `components/ui/reclassify-sheet-modal.tsx`
  - `lib/smart-storage-cache.ts`

**Tasks:**

- [ ] Add narrow row interfaces for dashboard rows.
- [ ] Add narrow FX row interface for `getRequiredRateTuples`.
- [ ] Keep raw AI payloads as `unknown` or typed records at boundaries.
- [ ] Replace high-impact `any` usages only where doing so reduces bugs.

**Verification:**

- `pnpm exec tsc --noEmit`
- Smart Dashboard and Reclassify browser smoke.

---

## Phase 9: Tooling Cleanup

**Purpose:** Make hygiene checks reliable.

**Files:**

- Modify:
  - `package.json`
  - possibly `eslint.config.mjs`

**Tasks:**

- [ ] Decide whether to restore ESLint or remove/replace the script.
- [ ] If restoring, add the correct Next/TS ESLint dependencies and config.
- [ ] Keep `pnpm exec tsc --noEmit` as the minimum hard gate.
- [ ] Do not include `supabase/` in Next TS config unless edge-function type noise is intentionally handled.

**Verification:**

- `pnpm lint` should either pass or be intentionally replaced with a working command.
- `pnpm exec tsc --noEmit` passes.

---

## Suggested Execution Order

1. Phase 0: Baseline and triage.
2. Phase 1: Smart Dashboard visible bugs.
3. Phase 2: Smart Storage preload/performance.
4. Phase 3: Reclassify optimization boundary.
5. Phase 4: Dashboard helper extraction.
6. Phase 5: Smart Storage helper extraction.
7. Phase 6: Shared edge hygiene.
8. Phase 8: Type boundary hardening.
9. Phase 9: Tooling cleanup.
10. Phase 7: Document pipeline extraction last, because it has the highest blast radius.

## Execution Policy

- Work can proceed without asking for approval at each small step.
- Stop and ask only for:
  - destructive data deletion
  - production deploys
  - schema migrations
  - dependency installs requiring network escalation
  - touching excluded areas
- Prefer one phase per commit when commits are requested.

## Completion Criteria

- Smart Dashboard loads without unexpected console errors.
- Saved merged KPI state hydrates correctly on first render.
- Smart Storage launch path is measurably cleaner or at least avoids duplicate fetch work.
- Reclassify keeps current workflow but has less debug noise and fewer redundant calls.
- `pnpm exec tsc --noEmit` passes.
- Lint/tooling state is no longer misleading.
- Large files remain functional, with the highest-risk orchestration moved behind narrow helpers where practical.

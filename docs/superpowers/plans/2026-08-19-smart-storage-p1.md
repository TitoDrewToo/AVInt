# Smart Storage P1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the highest-risk correctness gaps identified in the Smart Storage and reports-generator P1 review without changing verified tax math.

**Architecture:** Introduce one shared, server-side report scope resolver for folder ownership and descendant traversal, then pass that scope through every report engine path. Synchronize multi-row processing through explicit row-settlement state and use compensating cleanup for upload metadata failures, while preserving the existing storage/RLS and usage-metering boundaries.

**Tech Stack:** Next.js route handlers, Supabase/Postgres, Supabase Edge Functions, TypeScript, existing `tsx` test scripts, ESLint, Next build.

---

### Task 1: Folder-scoped report context

**Files:**
- Create: `lib/report-folder-scope.ts`
- Modify: `lib/report-engine.ts`
- Modify: `app/api/reports/[report]/route.ts`
- Modify: `app/api/mcp/[[...transport]]/route.ts`
- Test: `scripts/test-report-folder-scope.ts`

- [ ] Add a shared resolver that validates the requested folder belongs to the authenticated user, traverses descendants, and returns scoped file IDs.
- [ ] Extend `ReportFilters` with `targetFolder` and apply the scope to Tax Bundle and Business Expense reports and exports.
- [ ] Replace the route-local traversal with the shared resolver for the remaining report branches.
- [ ] Return a 400 response for an invalid or foreign folder instead of silently broadening the query.
- [ ] Add tests for root scope, nested descendants, empty folders, invalid IDs, and foreign IDs.

### Task 2: Multi-row processing lifecycle

**Files:**
- Modify: `supabase/functions/process-document/index.ts`
- Modify: `supabase/functions/normalize-document/index.ts`
- Add migration only if existing columns cannot represent pending row settlement.
- Test: targeted processing lifecycle script.

- [ ] Keep multi-row files in an explicitly non-final state until every inserted row reaches a terminal normalization state.
- [ ] Await or track all normalization calls and preserve partial-success/error information.
- [ ] Keep processing-job completion and usage metering idempotent.
- [ ] Add a deterministic test for success, partial failure, retry, and duplicate invocation behavior.

### Task 3: Upload compensation and orphan safety

**Files:**
- Modify the browser/server upload creation path identified during tracing.
- Modify: `supabase/functions/prescan-document/index.ts` only where cleanup safety requires it.
- Add a reconciliation migration/function only if the current schema supports safe ownership checks.

- [ ] On metadata/job insertion failure after object upload, attempt deletion of that exact inbox object.
- [ ] Never delete canonical or quarantined objects through the compensation path.
- [ ] Add structured logging for cleanup success/failure and a dry-run reconciliation query for future housekeeping.

### Task 4: Boundary coverage and typing

**Files:**
- Add focused schemas/types at extraction and normalization boundaries.
- Add integration-style tests for ownership isolation, report/export parity, provider failure, and concurrent export limits.

- [ ] Preserve raw extraction and provenance while validating persisted normalized fields.
- [ ] Keep domain-specific tax calculators separate from reusable query/context and output adapters.
- [ ] Run all existing tax, CSV, MCP, lint, and build checks.

---

## Acceptance

- Folder-scoped reports and exports include only the selected folder and descendants.
- Invalid or foreign folder IDs cannot broaden a report query.
- Tax amounts, meals treatment, income partitioning, and non-USD exclusion remain unchanged.
- Multi-row files are not reported as fully complete before normalization settles.
- Failed upload metadata writes do not leave avoidable inbox orphans.
- Existing tests pass; new boundary tests pass; lint and build pass.

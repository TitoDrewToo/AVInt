# P1 Handoff — Smart Storage and Reports Generator Review

Status: R&D review queue
Priority: First implementation task after the P0 universal workflow handoff is absorbed and discussed.
Scope: AVIntelligence Smart Storage ingestion, processing, report generation, and exports.

## Purpose

Review the current Smart Storage and reports-generator foundation for correctness, lifecycle integrity, maintainability, and future adaptability to the universal workflow platform described in `P0_HANDOFF_universal_workflow_platform.md`.

This is not a request to rush into implementation. Claude should first review the findings, confirm or challenge them against the current code and database state, and draft proposed solutions and next steps.

## Current assessment

The product is not a superficial or purely “vibe-coded” prototype. It contains meaningful systems engineering:

- Centralized tax/report math in `lib/tax-bundle.ts`.
- Pure, testable classification and aggregation logic.
- User-scoped server-side report queries and entitlement checks.
- RLS-backed storage and document isolation.
- Atomic usage/quota enforcement with advisory locks.
- Upload state machine: inbox → scan → approve/quarantine → process.
- Magic-byte validation and file-type verification.
- CSV formula/command-cell screening.
- Spreadsheet macro and embedded-content rejection.
- Multi-provider AI fallback for prescan and extraction.
- Exact QuickBooks/Xero export handling.
- Provenance-oriented raw extraction data and source-row retention.
- MCP report shaping and bounded-output tests.

Current verification evidence:

- Tax bundle tests: 151 passed, 0 failed.
- Accounting CSV tests: 17 passed, 0 failed.
- MCP report shaping tests: 5 passed, 0 failed.
- Production build: passed.
- Full lint: passed with four non-blocking warnings.

The system is real and production-oriented, but it has accumulated complexity and several P1 review items.

## P1 findings for Claude review

### P1-A — Folder filtering is ignored in the shared report engine

The Smart Storage UI sends `targetFolder` when opening reports. The route parses it and applies it to most report branches through `getFileIds()` in `app/api/reports/[report]/route.ts`.

However, `business-expense` and `tax-bundle` use the shared functions in `lib/report-engine.ts`:

- `taxRows()` accepts only user ID and date filters.
- `getReport()` calls `taxRows(userId, filters)`.
- `getExport()` calls `getReport()` without a folder scope.
- The route passes `{ dateFrom, dateTo }` but omits `targetFolder`.

Result: a user selecting a folder can receive all of their documents in the Tax Bundle or Business Expense report instead of that folder and its descendants.

Required review questions:

1. Should `ReportFilters` gain a validated folder scope?
2. Should folder ancestry be resolved once and shared by all report paths?
3. Should invalid or foreign folder IDs return an empty result or a 400 response?
4. How should MCP report calls express folder scope?
5. What integration tests prove root, nested, empty, invalid, and foreign-folder behavior?

Do not duplicate folder traversal logic across report implementations.

### P1-B — Upload object/database write atomicity and orphan cleanup

The browser upload path writes the storage object first, then inserts the `files` row, then inserts a processing job. Storage and database writes are not one transaction.

If the storage upload succeeds but a later insert fails, an orphaned object may remain in the documents bucket.

Required review questions:

1. Is the current orphan risk acceptable at present volume?
2. Should failed metadata writes immediately attempt storage cleanup?
3. Should a scheduled reconciliation job compare storage objects against `files.storage_path`?
4. Should upload creation move behind a server endpoint or remain browser-direct with compensating cleanup?
5. How should cleanup avoid deleting valid scanner-managed or quarantined objects?

Preserve the current storage RLS boundary and scan inbox model.

### P1-C — Multi-row processing lifecycle is not fully synchronized

For spreadsheet/multi-row input, `process-document` inserts multiple `document_fields` rows, sets the file to `done`, and launches normalization calls for the rows. The processing job may remain active while normalization continues.

This can expose a file as complete before every row is normalized or before all row-level failures are known.

Required review questions:

1. What should `files.upload_status` mean: extraction complete, normalization complete, or full pipeline complete?
2. Should file status remain `processing` until all normalization calls settle?
3. Should row-level normalization be awaited, tracked by a batch ID, or finalized by an atomic counter/RPC?
4. How should partial success and retry behavior work?
5. What should the UI show when extraction is complete but normalization remains pending?

Do not sacrifice the existing idempotency and usage-metering behavior.

### P1-D — Report architecture has duplicated data shaping

The shared `lib/report-engine.ts` covers Tax Bundle and Business Expense, while other reports retain independent query and mapping logic in `app/api/reports/[report]/route.ts` and their page components.

This is workable but increases the risk that:

- ownership rules diverge;
- date/folder filters behave differently by report;
- field mappings drift;
- export and on-screen totals disagree;
- new workflow domains require copy-pasted report logic.

Claude should propose a gradual architecture, not a large rewrite. The target should be a reusable report query/context layer with domain-specific calculators and output adapters.

### P1-E — Extraction boundary typing and validation

The AI/SheetJS boundary uses many `any` values in `process-document` and related prescan code. The implementation does perform meaningful runtime validation, but the type boundary is weak.

Required review questions:

1. Which external payloads should receive explicit schemas?
2. Can extraction, normalization, and source-row structures be represented with discriminated unions?
3. Which fields require numeric/date/currency validation before persistence?
4. Which model outputs should be rejected versus preserved as low-confidence review rows?
5. How can stricter types improve future configurable workflow adapters?

Avoid replacing practical runtime validation with types alone.

### P1-F — Test coverage needs integration-level expansion

Current pure tests are strong for tax math, CSV exports, and MCP shaping. Missing coverage is primarily at the boundaries.

Proposed tests for Claude to prioritize:

- report ownership isolation;
- folder scope and descendant traversal;
- foreign/invalid folder IDs;
- report/export parity;
- failed storage upload compensation;
- failed `files` or `processing_jobs` inserts;
- duplicate prescan/process calls;
- multi-row partial normalization;
- retry after provider failure;
- quarantined objects and cleanup safety;
- firm-enrolled entitlement in report generation;
- accounting export usage limits under concurrency.

## Security and product constraints

- Preserve user and firm tenant isolation at the database and server layers.
- Do not move sensitive report authorization into client-only checks.
- Preserve the Smart Security ingestion boundary and its current observe/fail-closed configuration controls.
- Preserve audit/provenance data: source file, source row, raw extraction, normalization state, and review state.
- Do not alter verified tax math, deductible totals, meals treatment, income partitioning, or non-USD exclusion without a separate explicit review.
- Do not add client-facing pricing changes as part of this P1.
- Do not enable self-fix or autofix from this review. First produce a safe design and evidence plan.

## Requested Claude deliverable

After absorbing the P0 handoff, Claude should return:

1. Confirmation or correction of each finding.
2. A severity/priority reassessment.
3. Proposed architecture for each fix.
4. Migration/API/UI/test implications.
5. A staged implementation order.
6. Clear go/no-go criteria for any future self-fix or autofix capability.
7. A recommendation for which work should remain domain-specific versus become configurable workflow infrastructure.

## Initial recommendation

Start with P1-A, folder scoping, because it is a contained correctness issue with direct user-visible impact and a useful test of the future universal workflow query context. Then address P1-C lifecycle state, followed by P1-B cleanup/reconciliation. Treat P1-D and P1-E as gradual architecture work supported by boundary tests rather than a rewrite.

## Implementation log — 2026-08-19

The first implementation slice was completed without waiting for the Claude review:

- P1-A: Added a shared server-side folder scope resolver. Tax Bundle and Business Expense reports/exports now receive `targetFolder`; all report branches use the same ownership-checked descendant traversal. Invalid or foreign folders return `400 INVALID_REPORT_FOLDER` instead of broadening the query. The Claude/MCP report and export tools now accept an optional UUID folder scope.
- P1-B: Added compensating cleanup for browser and MCP ingestion metadata failures. Browser cleanup uses an authenticated server route because `_inbox` deletion remains blocked for clients by storage RLS. Cleanup validates the user, exact inbox prefix, optional file ownership/path match, and is rate-limited.
- P1-C: `process-document` no longer marks extracted multi-row files `done` before normalization. The file remains `processing`; `normalize-document` advances it to `normalized` only after no raw rows remain, including retry-ceiling and terminal-failure paths.
- Verification: folder scope 4/4, tax bundle 151/151, accounting CSV 17/17, MCP shaping 5/5, TypeScript, lint, and production build pass. Lint retains the four pre-existing warnings documented above.

P1-D/E/F remain staged for the next slice: gradual report-query/output-adapter convergence, stricter extraction-boundary schemas, and Supabase-backed integration/concurrency tests. The verified tax math and export logic were not changed.

## Follow-up implementation slice — 2026-08-19

- Added `supabase/functions/_shared/extraction-boundary.ts` and validated model/spreadsheet extraction rows before persistence. Malformed scalar, null, or nested-array rows now fail explicitly instead of reaching field mapping through an unsafe `any` boundary.
- Expanded folder-scope tests to cover owned and foreign/unknown folder identifiers. These remain deterministic boundary tests; Supabase-backed ownership and report/export parity tests are still required before P1-F is closed.
- Extracted a shared `accountingExportRows` adapter so Tax Bundle and Business Expense exports apply one centralized USD/exportability policy. Its focused test confirms income and non-USD rows cannot enter accounting output.
- Added a normalization batch UUID to each extraction run and a service-role Postgres settlement function that locks the file row, counts terminal/raw rows for that batch, and advances the file/job only when the batch is settled. The remaining integration test gap is now specifically database-backed execution of this function.
- Removed the duplicate multi-row normalization request: each inserted row is now submitted exactly once, with EdgeRuntime background execution and a synchronous fallback outside EdgeRuntime.
- Added a strict, hourly reconciliation path for stale unreferenced `documents/<user>/_inbox/*` objects. It is conservative by construction (UUID user prefix, exact `_inbox` scope, one-hour age floor, and a `files.storage_path` reference check), dry-run by default for system-admin review, and protected by `CRON_SECRET` for scheduled execution.
- Added a shared report query context so every HTTP report branch resolves ownership and descendant-folder scope once per request. The tax-bundle HTTP export now uses the same centralized accounting export adapter as the shared engine, preserving USD/category/document-type policy across screen and export paths.
- Added deterministic reconciliation tests, extraction-boundary tests, folder ownership tests, and nested-file export parity coverage. Supabase-backed RPC/concurrency tests remain environment-dependent because Docker was unavailable in this workspace; the migration and test seam are ready for the project-linked Supabase test runner.

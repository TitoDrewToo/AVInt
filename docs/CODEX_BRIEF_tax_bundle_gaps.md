# Codex Brief — Tax Bundle & Accounting Export Correctness Gaps

Status: **plan for review — do not implement before approval** (material report/tax logic
per CLAUDE.md governance). Two defects found while running a live Tax Bundle report +
QuickBooks export against a real Pro account (`avinnilooban@gmail.com`, 9 files / 86
`document_fields`) through the exact repo code paths (`lib/report-engine.ts`,
`lib/tax-bundle.ts`, `lib/accounting-csv.ts`).

---

## Issue 1 — Spreadsheet-imported expenses are silently dropped from the Tax Bundle and all accounting exports

### Symptom (observed)
On the test account, the Tax Bundle expense side and the QuickBooks CSV export included
**only the 6 image receipts**. All ~60+ expense line items imported via
`reclassify-stress-test.xlsx` (Rent, Software, Fuel, Meals, Travel, etc.) were excluded.
Wage/business **income** from the same spreadsheet still counted (those rows carry
`income_source`), but **expenses did not**. Result: `totalExpensesRaw` and
`deductibleExpenses` are understated, and the QB/Xero exports omit real deductible spend.

### Current implementation shape (root cause)
Expense detection keys off the **file-level** `files.document_type`, which for any
spreadsheet upload is `csv_export` — a *transport/upload label*, not a content category
(this is already documented in `lib/advanced-analytics-config.ts` lines ~359–366).

- `lib/tax-bundle.ts:276` — `computeTaxBundle` only pushes to `expenseRows` when
  `document_type === "receipt" || document_type === "invoice"`. `csv_export` rows are
  neither expense nor income (their `classify()` returns `null`), so they are dropped
  from all expense math.
- `lib/report-engine.ts:44` — `getExport` filters `["receipt","invoice"].includes(document_type)`
  before mapping to `AccountingExportRow`, so `csv_export` expenses never reach
  `generateQuickBooksCSV` / `generateXeroCSV`.
- `lib/report-engine.ts:34` — `getReport(business-expense)` uses the same filter.
- `lib/report-engine.ts:18` — `taxRows` SELECT does **not** include `raw_json`, so the
  per-row content type is not even available downstream.

### Reference implementation already in the repo (use this — do not invent a new scheme)
`lib/smart-dashboard.ts:228–250` already solves this exact problem:
- `EXPENSE_DOCUMENT_TYPES = new Set(["receipt","invoice","transaction_record"])`
  (note: **`transaction_record` is also missing** from the tax-bundle/export filters).
- `rowDocumentType(row)` reads `row.raw_json.gemini_raw.document_type` (the per-row
  content type produced by the deterministic+AI spreadsheet extractor).
- `classifyRow(row)` resolves income vs expense from the **row content type** first,
  then file type, and for `csv_export` falls back to amount shape
  (`gross_income`/`net_income` ⇒ income; `total_amount` ⇒ expense).

### Recommended approach
1. Introduce one shared content-classification helper (lift/generalize
   `classifyRow` + `rowDocumentType` from `smart-dashboard.ts` into a shared module,
   e.g. `lib/document-classification.ts`) so dashboard, tax bundle, and exports use a
   single source of truth. This satisfies "centralize logic over duplicated logic."
2. `taxRows` (report-engine): add `raw_json` (or at least `raw_json->gemini_raw->document_type`)
   to the SELECT so content type is available.
3. `computeTaxBundle`: replace the `receipt|invoice` literal at `tax-bundle.ts:276` with
   the shared `isExpenseRow()` (content-type aware, includes `transaction_record`, and the
   `csv_export`+amount fallback). Income classification should likewise prefer content type.
4. `getExport` / `getReport(business-expense)`: replace the literal filters
   (`report-engine.ts:34,44`) with the same shared `isExpenseRow()`.
5. Keep the `income_source`-first logic for income intact — it already works.

### Closure criteria
- Running the Tax Bundle on the test account includes the spreadsheet expense line items;
  `totalExpensesRaw` / `deductibleExpenses` reconcile against the full expense set.
- QuickBooks (3-col + 4-col) and Xero exports contain the spreadsheet expenses.
- Dashboard totals and tax-bundle totals agree on what counts as an expense (single helper).
- Unit tests: extend `scripts/test-tax-bundle.ts` / `scripts/test-accounting-csv.ts` with
  a `csv_export` + `transaction_record` fixture (the seeded `reclassify-stress-test.xlsx`
  is a good basis — see `scripts/seed-reclassify-fixture.ts`).

---

## Issue 2 — Tax Bundle aggregates across currencies; it must be USD-only

### Symptom (observed)
Test data mixes USD / PHP / EUR. `computeTaxBundle` currently picks a single
`primaryCurrency` by magnitude weight and **sums `total_amount` across all currencies
regardless** (e.g. a PHP 369 receipt was added into USD `totalExpensesRaw`). The CSV
prints a mixed-currency warning but the numeric totals are still cross-currency sums —
i.e. wrong for filing.

### Intended behavior (per Andrew)
- **Tax Bundle report + accounting exports: USD only.** Non-USD rows must never be summed
  into USD tax figures.
- **Dashboards: keep multi-currency** (they already bucket per currency via
  `computeBucket` in `smart-dashboard.ts` — leave that untouched).

### Current implementation shape (root cause)
`lib/tax-bundle.ts:245–443` (`computeTaxBundle`) computes all totals over the full `rows`
array with no currency partition; `currency` only influences the display
`primaryCurrency` and the mixed-currency warning string.

### Recommended approach
1. In the Tax Bundle path, **partition rows by currency and compute the bundle strictly on
   `currency === "USD"`** (treat null/blank currency as USD only if that matches the
   normalizer's default — confirm against `process-document`).
2. Surface non-USD rows in a clearly labeled **"Excluded — non-USD (not filed)"** section
   of the report and CSV, with counts and per-currency raw subtotals, so nothing is hidden.
   Do **not** FX-convert (no trusted rate source in-repo; converting would overstate
   accuracy — violates the "labels must not overstate math" standard).
3. `getExport` (QB/Xero): restrict to USD rows as well, or the export inherits the mixed
   figures. Prefer USD-only to match the report.
4. Decide the scope boundary explicitly in code comments: dashboards = multi-currency,
   tax bundle/exports = USD-only.

### Closure criteria
- Tax Bundle USD totals contain zero non-USD contribution; a report run on mixed data
  shows USD figures + a visible non-USD exclusion section.
- QB/Xero exports contain only USD rows.
- Dashboard multi-currency behavior unchanged (regression check).
- Test fixture with USD+PHP+EUR asserts the partition.

---

## Implementation order
1. Shared `document-classification` helper (Issue 1, step 1) — unblocks the rest.
2. Wire tax-bundle + report-engine to the helper; add `raw_json` to the SELECT.
3. Currency partition for the tax-bundle/export path (Issue 2).
4. Tests + fixtures for both.
5. Reconciliation pass: dashboard vs tax-bundle expense definitions agree.

## Notes / open questions for review
- Confirm the canonical set of expense content types (is `transaction_record` in, and are
  there others the normalizer emits?). Align `EXPENSE_DOCUMENT_TYPES` accordingly.
- Confirm the normalizer's default currency when `currency` is null, before treating null
  as USD in the tax bundle.
- Both changes are material (report/tax logic) — land behind review, not silently.

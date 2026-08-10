# Tax Bundle & Accounting Export Correctness Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ensure spreadsheet-derived expenses are classified consistently and Tax Bundle/accounting calculations include only explicitly USD-denominated rows.

**Architecture:** Extract the existing Smart Dashboard row classification into `lib/document-classification.ts`. Tax Bundle aggregation will retain income-source precedence for income rows, but all report math will run over an explicit-USD partition; non-USD and unknown-currency rows will remain visible in an exclusion section. Report-engine queries and accounting exports will reuse the same predicates, while dashboard multi-currency behavior will continue to use the shared classifier and native currency buckets.

**Tech Stack:** TypeScript, Next.js, Supabase data queries, pure report helpers, standalone `tsx` regression scripts.

---

## Confirmed decisions

- Canonical expense content types are `receipt`, `invoice`, and `transaction_record`; this matches `process-document` and the existing Dashboard set.
- `csv_export` is transport metadata only. For it, `gross_income`/`net_income` means income and `total_amount` means expense.
- `income_source` remains the first choice for Tax Bundle income classification after a row is not classified as an expense.
- `process-document` writes `currency: null` when currency is absent or cannot be inferred. Null/blank is not USD and will be excluded from filing math.
- Tax Bundle `primaryCurrency` will be `USD` because the filing math is USD-only, even when there are no USD rows. The full source currency list remains available for warnings/audit.
- Non-USD/unknown rows will appear in the Tax Bundle UI and generated Tax Bundle CSV as `Excluded — non-USD (not filed)` with counts and raw subtotals by currency. QuickBooks/Xero output remains import-ready and contains only USD expense rows.
- Dashboard totals remain multi-currency and are not converted or partitioned by this change.

## File map

- Create: `lib/document-classification.ts` — shared content/file classification and currency predicates.
- Modify: `lib/smart-dashboard.ts` — consume the shared classifier without changing native currency bucketing.
- Modify: `lib/tax-bundle.ts` — add raw JSON typing, explicit-USD aggregation, exclusion summary, and exclusion CSV section.
- Modify: `lib/report-engine.ts` — select `raw_json`, use shared expense/USD predicates for business reports and exports.
- Modify: `app/tools/smart-storage/reports/tax-bundle/page.tsx` — show USD-only wording and excluded-row summary.
- Modify: `scripts/test-tax-bundle.ts` — content-type, spreadsheet fallback, transaction-record, currency partition, and CSV exclusion tests.
- Modify: `scripts/test-accounting-csv.ts` — preserve formatter coverage and add export-row fixture coverage if needed by the selected helper boundary.
- Inspect only: `supabase/functions/process-document/index.ts`, `scripts/seed-reclassify-fixture.ts` — source-of-truth validation; no pipeline behavior change.

### Task 1: Add the shared document classifier

**Files:** Create `lib/document-classification.ts`; modify `lib/smart-dashboard.ts`; test through `scripts/test-tax-bundle.ts` fixtures.

- [ ] Add exported sets for `INCOME_DOCUMENT_TYPES` and `EXPENSE_DOCUMENT_TYPES`.
- [ ] Add `rowDocumentType(row)` that reads `raw_json.gemini_raw.document_type` before falling back to the file/document type.
- [ ] Add `classifyRow(row): "income" | "expense" | null` with this order: content type, file type, then `csv_export` amount shape.
- [ ] Add `isExpenseRow(row)` and `isUsdRow(row)`. `isUsdRow` returns true only when `currency.trim().toUpperCase() === "USD"`; null, blank, and `UNSPECIFIED` return false.
- [ ] Replace the private Dashboard sets/functions with imports from the helper. Keep `computeBucket`’s per-currency grouping and native amounts unchanged.
- [ ] Run `pnpm exec tsc --noEmit` and `pnpm exec tsx scripts/test-tax-bundle.ts`; the pre-change fixture suite must remain green.

### Task 2: Wire raw content type and shared expense detection into report-engine

**Files:** Modify `lib/report-engine.ts`.

- [ ] Add `raw_json` to the `document_fields` select and preserve it in the mapped `TaxRow`.
- [ ] Extend `TaxRow` with `raw_json?: unknown` so the shared helper can inspect spreadsheet row content.
- [ ] Replace both `receipt|invoice` filters with `isExpenseRow(row)`.
- [ ] Make accounting export input `isExpenseRow(row) && isUsdRow(row)` so spreadsheet and `transaction_record` expenses are included while non-USD rows are excluded.
- [ ] Keep ownership, date filtering, entitlement arguments, and existing CSV formatter calls unchanged.
- [ ] Run `pnpm exec tsc --noEmit` and the accounting/tax scripts.

### Task 3: Make Tax Bundle aggregation explicitly USD-only

**Files:** Modify `lib/tax-bundle.ts`.

- [ ] Add summary fields:

```ts
excludedNonUsdRows: TaxRow[]
excludedNonUsdByCurrency: Map<string, number>
excludedNonUsdRaw: number
```

- [ ] Normalize currencies for display as uppercase codes, using `UNSPECIFIED` for null/blank values. Build `usdRows = rows.filter(isUsdRow)` and `excludedNonUsdRows = rows.filter(row => !isUsdRow(row))`.
- [ ] Run all existing income, expense, Schedule C, meals, review, and net calculations over `usdRows` only.
- [ ] Use `isExpenseRow` for expense detection. For non-expense rows, retain the existing `income_source`-first classification and legacy payslip/income-statement fallback.
- [ ] Set `primaryCurrency` to `USD`; retain all observed currencies in `currencies`; set `mixedCurrency` when any excluded row exists.
- [ ] Accumulate excluded raw subtotals with `getTaxRowAmount(row)` by normalized currency, without FX conversion.
- [ ] Update `generateTaxBundleCSV` to emit a clearly labeled section:

```text
EXCLUDED — NON-USD (NOT FILED)
Currency,Row Count,Raw Subtotal
PHP,...,...
EUR,...,...
UNSPECIFIED,...,...
```

The section must appear before the USD Schedule C detail and must not change the existing import/export column headers or USD totals.
- [ ] Replace the existing mixed-currency warning text that says totals are mixed with wording that states USD-only math and identifies excluded currencies.
- [ ] Keep employed Tax Bundle behavior explicit: it must use the same currency summary contract and must not accidentally include non-USD wages in wage totals.

### Task 4: Surface exclusions in the Tax Bundle report UI

**Files:** Modify `app/tools/smart-storage/reports/tax-bundle/page.tsx`.

- [ ] Read the new exclusion fields from `computeTaxBundle`.
- [ ] Change the mixed-currency warning to state that only explicit USD rows are included in filing math and no FX conversion occurs.
- [ ] Add a visible `Excluded — non-USD (not filed)` panel showing row count and per-currency raw subtotals, including `UNSPECIFIED` where applicable.
- [ ] Keep Dashboard components and multi-currency report displays untouched outside this Tax Bundle page.
- [ ] Confirm the USD summary strip, monthly expenses, duplicate detection, readiness checks, and evidence CSV all use the USD-only `expenseRows` returned by the summary.

### Task 5: Add regression fixtures and assertions

**Files:** Modify `scripts/test-tax-bundle.ts` and `scripts/test-accounting-csv.ts`.

- [ ] Add a `csv_export` row with `raw_json.gemini_raw.document_type: "transaction_record"` and `total_amount`; assert it is an expense.
- [ ] Add a `csv_export` row with `raw_json.gemini_raw.document_type: "receipt"`; assert it is an expense even when the file type is transport-only.
- [ ] Add a `csv_export` row with `gross_income`; assert it remains income and does not enter expenses.
- [ ] Add a direct `transaction_record` expense fixture; assert it enters `totalExpensesRaw`, Schedule C, and deductible totals.
- [ ] Add USD, PHP, EUR, and null-currency income/expense fixtures; assert every non-USD/unknown row is excluded from all numeric Tax Bundle totals and appears in the exclusion map/CSV.
- [ ] Assert the USD-only estimated Schedule C net and reconciliation identity.
- [ ] Assert the Tax Bundle CSV contains `EXCLUDED — NON-USD (NOT FILED)` and each currency subtotal, while USD Schedule C lines contain only USD rows.
- [ ] Add an export fixture path that verifies only USD expense rows are passed to QuickBooks 3-column, QuickBooks 4-column, and Xero generation; retain existing formatter assertions.
- [ ] Run:

```bash
pnpm exec tsx scripts/test-tax-bundle.ts
pnpm exec tsx scripts/test-accounting-csv.ts
pnpm exec tsc --noEmit
npm run build
```

Expected result: all existing assertions and new assertions pass; Dashboard source and tax-bundle expense definitions agree for receipt, invoice, transaction_record, and spreadsheet csv_export rows.

### Task 6: Reconciliation and review handoff

- [ ] Compare the shared helper’s classification against `lib/smart-dashboard.ts` for the seeded `reclassify-stress-test.xlsx` shape, including `raw_json.gemini_raw.document_type` and file `document_type: "csv_export"`.
- [ ] Run the existing seed fixture only when credentials are available, then verify spreadsheet expenses appear in Tax Bundle totals and all three accounting exports while PHP/EUR/null rows are excluded.
- [ ] Confirm no changes were made to `supabase/functions/process-document/index.ts` or dashboard currency aggregation.
- [ ] Review the final diff for tax-label accuracy: no UI or CSV text may imply FX conversion or that excluded amounts entered USD totals.
- [ ] Obtain explicit approval before implementation/deployment because this changes filing/report math.

## Closure criteria

- Spreadsheet expense rows, including `csv_export` and `transaction_record`, appear in Tax Bundle and exports through the shared classifier.
- Tax Bundle numeric totals and QuickBooks/Xero exports contain only explicit USD rows.
- Non-USD and unknown rows are visibly labeled and subtotaled as excluded, with no FX conversion.
- Dashboard totals remain native multi-currency and regression tests remain green.
- `npm run build`, `tsc`, accounting tests, and tax-bundle tests pass.

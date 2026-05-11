# Smart Dashboard Phase 0 Batch 1.5 Report

## 1. Files modified

- `lib/advanced-analytics-config.ts` — added 10 lines to the Haiku system prompt.
- `supabase/functions/generate-rd-analytics/index.ts` — added 10 lines to the Sonnet R&D system prompt.
- `docs/smart-dashboard-phase-0-batch-1-5-report.md` — this report.

## 2. New csv_export guidance text

### a. Haiku prompt

```text
CSV transport-label rules:
- Treat csv_export as a transport/upload label, not a content category. Never present csv_export as a legend value, axis tick, or breakdown category in a chart.
- For breakdown widgets using composition_simple, composition_stacked, or any family where document_type would appear as a dimension, avoid document_type when csv_export rows are more than 10% of the in-scope data.
- When csv_export rows exceed that threshold, prefer expense_category for expense-side breakdowns, income_source for income-side breakdowns, or vendor_normalized / merchant_domain when the categorical cardinality is readable at about 3-8 buckets.
- Document_type breakdowns are allowed when csv_export is absent or less than 10% of rows.
- In titles, descriptions, and insights, never write csv_export, Csv_export, CSV export, or spreadsheet upload as if it were a content category.
- If you need to describe what CSV rows contain, translate to the actual content signal inferred from expense_category, is_recurring, vendor patterns, merchant_domain, or counterparty_name.
- If a breakdown was redirected away from document_type, make the widget description and insight name the actual dimension used; never keep stale "by document type" framing.
- Receipt remains a valid content label when receipts are a genuine slice. These rules target csv_export specifically; other content labels such as receipt, invoice, payslip, income_statement, contract, and transaction_record are unaffected.
```

### b. Sonnet prompt

```text
CSV transport-label rules:
- Treat csv_export as a transport/upload label, not a content category. Never surface csv_export as a legend value, axis tick, grouping key, or breakdown category.
- If a candidate R&D angle would group by document_type and csv_export rows are more than 10% of the relevant data, redirect to a real content signal instead.
- For expense-side work, prefer expense_category. For income-side work, prefer income_source. For readable categorical stories, use vendor_normalized or merchant_domain when they produce about 3-8 useful buckets.
- Document_type can still be used when csv_export is absent or less than 10% of rows.
- Never write csv_export, Csv_export, CSV export, or spreadsheet upload in titles, descriptions, insights, axis values, or legend values as if it were content.
- When you need to describe what CSV rows contain, infer the actual content from expense_category, is_recurring, vendor patterns, merchant_domain, counterparty_name, raw_json excerpts, or line items.
- If you redirect away from document_type, describe the real dimension you used; do not leave stale "by document type" framing in the widget.
- Receipt remains a valid content label when receipts are truly part of the pattern. These rules target csv_export only; receipt, invoice, payslip, income_statement, contract, and transaction_record keep their normal meaning.
```

## 3. Typecheck result

Passed:

```bash
npx tsc --noEmit --pretty false
```

## 4. Additive-only confirmation

Existing prompt sections were not removed or restructured. The changes add one new `CSV transport-label rules` section to each prompt.

## 5. Decisions made

- Inserted the Haiku section after `Generation rules` and before the JSON output contract, so the rules apply as decision-making guidance rather than schema formatting.
- Inserted the Sonnet section after `Sufficiency rules` and before the output contract, matching the R&D prompt's methodological flow.
- Kept this as prompt guidance only. No runtime validation, renderer changes, aggregation logic, or schema enforcement was added.

## 6. Blockers encountered

None.

## 7. Scope confirmation

- No schema changes.
- No migration files created or modified.
- No edge function deploys.
- No changes outside `lib/advanced-analytics-config.ts`, `supabase/functions/generate-rd-analytics/index.ts`, and this report file for this batch.
- No changes to `generate-context-summary`, dashboard rendering, `page.tsx`, `lib/smart-dashboard.ts`, aggregation code, Zod schemas, or Smart Storage report code.
- No git operations.

# AVInt Tax Surfaces

Use this file to quickly orient on the Smart Storage tax/reporting implementation.

## Core Files

- `lib/tax-bundle.ts`
  - Pure aggregation and CSV export for tax bundle flows.
  - Owns Schedule C mapping, meals haircut, wage/self-employment partitioning, other-income partitioning, mixed-currency flags, and summary totals.
- `scripts/test-tax-bundle.ts`
  - Standalone regression suite for tax bundle math and CSV output.
  - Covers clean self-employment, meals-heavy, uncategorized-only, review-heavy, mixed-currency, mixed-income, and wage-only cases.
- `app/api/reports/[report]/route.ts`
  - Premium-gated report API.
  - Pulls `document_fields` joined to `files`, filters excluded normalization rows, and applies date/folder filters.
- `app/tools/smart-storage/reports/tax-bundle/page.tsx`
  - Self-employed Schedule C-oriented report page.
  - Must render business income as Schedule C base and show wage/other income separately.
- `app/tools/smart-storage/reports/tax-bundle/employed/page.tsx`
  - Employee income worksheet.
  - Must remain a wage/payslip review surface, not a W-2 replacement.
- `app/tools/smart-storage/reports/business-expense/page.tsx`
  - Business expense report using Schedule C categories.
- `app/tools/smart-storage/reports/profit-loss/page.tsx`
  - Bookkeeping rollup, not a pure tax filing surface.
- `supabase/functions/normalize-document/index.ts`
  - Normalization prompt and category/source vocabulary.
  - Important distinctions: `merchant_domain` is merchant identity; `expense_category` is accounting/tax category. `income_source` partitions business, wage, investment, rental, interest, and other income.

## Current Invariants

- Schedule C net is based only on self-employment/business income:
  `estimatedNetScheduleC = selfEmploymentGross - deductibleExpenses`.
- W-2/payslip income is informational and must not be offset by Schedule C expenses.
- Other income classes are informational and not Schedule C unless explicitly classified as business/self-employment.
- Mixed currencies are detected and warned; no FX conversion exists.
- Meals are 50% deductible on Line 24b.
- Entertainment is intentionally absent from deductible Schedule C mappings.
- Line 27b is the catch-all for Schedule C Part V "Other expenses"; Line 27a is not a general other bucket.
- Equipment/hardware defaults to Line 13 with notes rather than automatic de minimis or section 179 election treatment.
- Uncategorized rows are excluded from deductible totals.
- Low-confidence or unmapped rows are review-visible and auditable.

## Risk Patterns To Look For

- Any use of `totalGross - deductibleExpenses` as Schedule C net.
- UI copy that implies filing-ready or official tax calculation output.
- CSV rows that omit source file or status.
- Mixed-currency totals displayed without a warning.
- Employee report language that implies W-2, 1099, or withholding verification.
- Report math duplicated in React instead of delegated to `lib/tax-bundle.ts`.
- Normalizer changes that collapse `merchant_domain`, `expense_category`, and `income_source`.
- New expense categories that do not map deliberately to Schedule C or "needs review".

## Useful Commands

```bash
node .agents/skills/avint-tax-bundle-review/scripts/audit-tax-bundle.mjs
npx tsx scripts/test-tax-bundle.ts
rg -n "estimatedNetScheduleC|totalGross|wageGross|mixedCurrency|Line 24b|Line 27a|Line 27b|tax advice|W-2|1099" lib app/tools/smart-storage/reports
```

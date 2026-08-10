---
name: avint-tax-bundle-review
description: Review and improve AVIntelligence Smart Storage tax bundle and financial report surfaces. Use when working on Schedule C-oriented tax bundle reports, employee income worksheets, business expense reports, profit/loss views, CSV/PDF export wording, tax disclaimers, income-vs-expense classification, wage-vs-self-employment separation, deductible expense mapping, IRS Schedule C line mapping, or accountant/preparer review workflows in AVIntelligence.
---

# AVInt Tax Bundle Review

Use this skill for AVIntelligence tax-bundle/report work where precision matters more than generic accounting advice.

## Hard Boundaries

- Do not present AVIntelligence output as tax advice, a filed return, W-2/1099 substitute, withholding verification, or official Schedule C Line 31 calculation.
- Do not offset W-2 wage income against Schedule C business expenses.
- Do not aggregate mixed currencies unless an explicit FX conversion layer exists.
- Do not auto-treat low-confidence, uncategorized, personal, entertainment, or ambiguous records as clean deductions.
- Do not modify Smart Security or unrelated AVInt surfaces unless the user asks.
- Prefer accountant/preparer review language over filing-ready claims.

## Load Order

1. Read `references/avint-tax-surfaces.md` for repo-specific files and invariants.
2. Read `references/tax-source-baseline.md` when changing tax logic, labels, disclaimers, category mapping, or filing-safety copy.
3. Run `node .agents/skills/avint-tax-bundle-review/scripts/audit-tax-bundle.mjs` before and after substantial edits.

## Review Workflow

1. Identify the report surface:
   - Self-employed tax bundle: `app/tools/smart-storage/reports/tax-bundle/page.tsx`
   - Employee income worksheet: `app/tools/smart-storage/reports/tax-bundle/employed/page.tsx`
   - Shared math/export logic: `lib/tax-bundle.ts`
   - Report API: `app/api/reports/[report]/route.ts`
   - Business expense/P&L related views: see `references/avint-tax-surfaces.md`
2. Trace the data path from `document_fields` through `computeTaxBundle()` into UI and CSV output.
3. Check the core math invariants:
   - `deductibleExpenses === sum(scheduleC[*].amount)`
   - `estimatedNetScheduleC === selfEmploymentGross - deductibleExpenses`
   - `wageGross`, `wageNet`, and payroll deductions remain informational only.
   - Meals on Line 24b apply the 50% haircut.
   - Uncategorized rows stay out of deductible totals.
   - Review rows remain visible and auditable.
4. Check the reporting language:
   - State "Schedule C-oriented", "pre-filing", "worksheet", or "for preparer review".
   - Avoid "tax return", "filing-ready", "guaranteed deductible", "verified withholding", or similar overclaims.
   - Keep W-2/1099 official-form caveats visible on employee and mixed-income surfaces.
5. Check auditability:
   - Every row shown/exported should retain source file, date, vendor/employer, category, amount, status, and line mapping where applicable.
   - Warnings should explain what the user must verify, not just that something is wrong.
6. Check tests:
   - Run `npx tsx scripts/test-tax-bundle.ts` after logic changes.
   - Add focused fixtures only when a new invariant or regression path is introduced.

## Output Style

For reviews, lead with concrete risks and file references. For implementation, keep changes narrow and preserve existing report architecture. When uncertain about tax treatment, downgrade to "needs review" instead of inventing a confident rule.

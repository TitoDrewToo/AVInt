# P1 — Math pillar: first-pass results (Tax Bundle)

Method: **independent recompute.** The tax-bundle figures were recomputed from raw
`document_fields` in **SQL** (a separate implementation) and diffed against the **TS engine's**
output captured from a live connector run — same account (`avinnilooban@gmail.com`, 86 fields).
Two independent implementations agreeing is the validation; a diff would be a bug.

## Reconciliation (engine vs independent SQL) — all exact
| Figure | Engine (TS) | Independent (SQL) | Match |
|---|---|---|---|
| totalExpensesRaw | 5,467.37 | 5,467.37 | ✓ |
| deductibleExpenses | 5,014.84 | 5,014.84 | ✓ |
| wageGross | 49,075.00 | 49,075.00 | ✓ |
| selfEmploymentGross | 60,000.00 | 60,000.00 | ✓ |
| excludedNonUsdRaw | 28,102.50 | 28,102.50 | ✓ |
(meals raw 363.10 → 181.55 deductible, folded into the reconciled deductible total.)

Verdict: **the Tax Bundle computation is validated on real data.** The engine computes what the
rules specify; the classification/USD-only/meals-halving/exclusion logic is self-consistent.

## Rules-level finding (NOT an implementation bug — a domain decision)
**Refunds/credits are dropped entirely.** The $450 USD "Refund" row is classified as income by the
guard but has no `income_source`, so it counts as neither expense nor income — it disappears from
every total. Both implementations agree it's dropped, so this is the *rule*, not a code error.
Effect: net expense is overstated. The current "drop entirely" is wrong under US tax law.

**Correct US treatment (verified; not CPA advice — preparer confirms):** timing-dependent.
- **Same tax year** as the expense → **reduce the expense** (net; purchase-price adjustment).
- **Later year** (expense already deducted in a prior year) → **include as income** under the
  **tax benefit rule (IRC §111)**, to the extent the earlier deduction gave a tax benefit.

Compliant-by-default design: net same-year refunds against the matching category; for refunds
not tied to a same-year expense, surface a flagged "recovery — may be taxable income (tax
benefit rule)" line for the preparer. Never drop. Material tax-logic change — implement after
owner/preparer sign-off (tracked).

## Method notes (feeds the skill)
- Independent recompute in a different language/engine is the core check — it validated the math
  *and* surfaced the refund rule. Keep this as the required method for every report.
- Next reports to run the same recompute against: Business Expense, P&L, Income Summary, Expense
  Summary (Contract/Key Terms are non-numeric).

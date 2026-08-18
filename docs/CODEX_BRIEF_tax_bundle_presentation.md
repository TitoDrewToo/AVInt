# Codex Brief — Tax Bundle (Schedule C) presentation polish
### P1. Full findings: `docs/P1_TaxBundle_Presentation_Review.md`

## Hard rule
**The math is verified correct — do NOT change any deductible amounts, totals, the 50% meals
haircut, income partitioning, or non-USD exclusion.** Every task below is presentation, mapping
*transparency*, or test data. If a change would alter a deductible/total figure, stop and flag it.
Keep report logic centralized (`lib/tax-bundle.ts`, `document-classification.ts`); no duplicated
logic.

## Task 1 · One-page "Preparer Summary" at the top
Add a compact summary block above the detail: the 8 Schedule C lines (line, IRS category, raw,
proposed deductible, status) + Business Income, Proposed Deductible, Estimated Net. This is the
transcription surface — it should lead and be clean to print on page 1.

## Task 2 · Make the numbers foot + reconcile counts
- In the Schedule C expense breakdown, the total **raw** ($5,467.37 in the sample) includes
  uncategorized rows that have no visible line, so the shown line-raws don't sum to the total.
  **Add an "Uncategorized (excluded from deductible)" row** (raw shown, deductible $0) so the raw
  column foots to the total. Deductible total must stay unchanged.
- **Reconcile the "Supporting documents (N)" heading** with what's actually listed/counted (it
  currently reads 86 against ~42 shown + income + 32 excluded non-USD). Either make N the true
  count of listed rows, or label precisely what it includes. Mismatched counts erode accountant
  trust.

## Task 3 · Tooltips that explain OUR conventions (not basic tax)
Audience = US preparers who know Schedule C but not our choices. Add hover tooltips (and make them
tap-accessible on mobile) on:
- Each **Schedule C line** — what it captures + which of "our categories" map into it.
- **"Proposed Deductible"** — our proposal, pre-review; the preparer decides.
- **"Estimated Net"** — explicitly NOT the Line 31 net profit.
- **"Payroll Deductions"** — gross−net differential, not verified withholding.
- **clean / needs-review / uncategorized** buckets.
- Each **Accountant Review Packet Readiness** check — what it means + how to clear it.

## Task 4 · Category → Schedule C line mapping: transparency + SaaS default
- Surface the **category→line mapping** (via the Task 3 tooltips) and keep reclassification easy.
- **Reconsider the SaaS default:** software subscriptions currently map to **Line 22 "Supplies,"**
  which is non-standard — preparers usually use **Line 27a "Other expenses"** or **Line 18 "Office
  expense."** Change the default mapping for software/SaaS to **Line 27a "Other"** (confirm with
  Andrew) in the centralized mapping. NOTE: software is fully deductible either way, so this
  changes only the *line placement*, not any deductible total. Do not touch amounts.

## Task 5 · (LAST / OPTIONAL) Clean demo dataset + sample files
> Sequence this LAST, right before outreach. It's an additive "if they ask" asset — the pages,
> decks, and agreement are meant to close the deal without it.
- Build a **clean demo fixture**: one realistic USD self-employed Schedule C client — single
  currency, all rows categorized, no missing classification — so the report scores ~100% Accountant
  Review Readiness and reads polished. (Separate from the existing reclassify-stress fixture, which
  stays for edge-case testing.)
- From that clean dataset, generate and save the **sample bundle**: the report PDF + Schedule C CSV
  + QuickBooks CSV + Xero CSV. Keep them as static sample assets for firm exchanges.

## Acceptance
- All deductible amounts/totals/meals/partitioning/non-USD figures **identical** to before.
- Raw column foots; supporting-docs count reconciles.
- Preparer Summary present and print-clean; tooltips present and accessible.
- SaaS default line updated in the central mapping (amounts unchanged).
- Clean demo scores ~100% readiness; sample PDF + 3 CSVs generated.
- TypeScript + lint + build pass.

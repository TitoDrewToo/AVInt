# P1 — Tax Bundle (Schedule C) Review: math + presentation
### Source: live report printed to PDF, 18 Aug 2026 (reclassify-stress dataset) + export CSVs

## Verdict
**Math is correct** (audited to the cent). The report is strong and preparer-oriented. The work
is presentation tightening + one mapping question + tooltips + a clean demo dataset for samples.
Nothing here is a correctness emergency — it's polish that gets us to "this is awesome, let's do
this."

## Math verified ✓
- Deductible foots exactly to **$5,014.84** (sum of the 8 line deductibles).
- Meals (Line 24b): raw $363.10 → $181.55 (×50%). ✓
- clean $4,681.31 + needs-review $333.53 = $5,014.84 deductible. ✓
- Income partitioned correctly: Business $60,000 → Estimated Net $54,985.16 (60,000 − 5,014.84);
  Wage $49,075 and Other $450 held out (not offset). ✓
- Non-USD (32 rows, PHP/EUR/unspecified) excluded, no FX — correct + honest.
- Exports: QuickBooks/Xero CSVs keep meals at **full** $300 (correct — 50% is a tax adjustment,
  not a books entry); the Schedule C CSV shows the 50% deductible. ✓

## What's excellent (lean on these)
- The honest framing: "What this report is / is NOT" (not a tax calc, not Line 31, Circular 230,
  "for accountant review or transcription, not direct import"). Preparers will trust this.
- **Accountant Review Packet Readiness** (X/9 checks) — a great, preparer-friendly QA surface.
- Schedule C line mapping with IRS category, raw + proposed deductible, item counts, OK/review.
- Income partitioning (wage vs business vs other) with clear "informational only" labels.
- Full audit trail (every doc: vendor, amount, category, confidence, date) — the evidence value.

## Fixes (prioritized)
1. **The "raw" column doesn't foot to the visible rows.** Expense-breakdown total raw
   **$5,467.37** includes ~$270.98 of *uncategorized* items that have **no visible row**, so the 8
   shown line-raws sum to $5,196.39. A detail preparer will try to foot and get confused. → Add an
   **"Uncategorized (excluded from deductible)" row** ($270.98 raw / $0 deductible) so the table
   foots, or footnote it.
2. **"Supporting documents (86)" count** doesn't obviously reconcile with the ~42 counted docs +
   income + the 32 excluded non-USD. → Reconcile the number or label what it counts. A mismatched
   count erodes trust fast with accountants.
3. **Mapping question — Software → Line 22 "Supplies."** ~20 SaaS subscriptions (~$1,802) are
   mapped to **Supplies (Line 22)**. That's non-standard: preparers usually put recurring software
   under **Line 27a "Other expenses"** (itemized) or **Line 18 "Office expense."** "Supplies"
   traditionally = consumable materials. → Either remap SaaS to Line 27a/18, or (better) make the
   mapping transparent + easily reclassifiable and don't assert a non-standard line confidently.
   This is the one domain-accuracy item worth resolving.
4. **Tooltips (Andrew's idea — yes, and here's where they pay off).** The audience are US
   preparers who know Schedule C but not OUR conventions — so tooltips should explain *our
   choices*, not basic tax:
   - Each Schedule C **line**: what it captures + which "our categories" map into it.
   - **"Proposed Deductible":** it's pre-review, our proposal, preparer decides.
   - **"Estimated Net":** explicitly *not* Line 31 net profit.
   - **"Payroll Deductions":** gross−net, not verified withholding.
   - **clean / needs-review / uncategorized** buckets.
   - The **readiness checks** (what each check means + how to clear it).
5. **Add a one-page "Preparer Summary" up top** — the 8 Schedule C lines + Estimated Net, before
   the 7 pages of detail, so the transcription surface is front-and-center and printable.
6. **Minor:** surface low-confidence items (35%/48%/66%) more clearly toward "review"; OCR vendor
   typos ("ubre"/"Strabucks") are cosmetic but noticed — not blocking.

## For the sample files a firm might ask to see
The current PDF used the **reclassify-stress** fixture (mixed currencies, missing classification,
low-confidence rows) → readiness only ~56%. Great for testing edge cases; **wrong for a
firm-facing sample.** → Build a **clean demo dataset**: one realistic USD Schedule C client,
single currency, all categorized, that scores ~100% readiness and reads polished. Generate the
sample **source-output PDF + Schedule C CSV + QuickBooks/Xero CSVs** from it, and keep them on hand
for "what does it look like?" during a firm exchange.

## Next
- Codex brief: (1) presentation fixes #1–#5 + tooltips; (2) a clean demo fixture + generate the
  sample files. Math needs no change.

# P1 — Export format validation: QuickBooks & Xero (findings)

First pass of the Reports & Exports Accuracy review, export pillar. Compares our
`lib/accounting-csv.ts` output against the documented QuickBooks Online and Xero CSV
import specs. Items marked **[real-import test]** can only be fully confirmed by importing
into a live QBO/Xero sandbox — that is the required final step for this pillar.

## QuickBooks Online — bank-transaction CSV import
Spec: 3-col `Date,Description,Amount` or 4-col `Date,Description,Credit,Debit`; row 1 =
headers; no currency symbols/commas in amount fields; one consistent date format (e.g.
MM/DD/YYYY); **negative = money out, positive = money in**; ~350 KB upload cap.

Our `generateQuickBooksCSV`:
- **3-col** — header ✓, date MM/DD/YYYY ✓, expenses as `-abs` (money out = negative) ✓.
  **Matches the spec.**
- **4-col** — header order `Date,Description,Credit,Debit` ✓; we place the expense amount in
  **Debit**, Credit blank. ✅ **CONFIRMED via real QBO import (2026-08-11):** QuickBooks
  auto-maps "Money spent" → Debit and "Money received" → Credit, and imported every expense as
  a negative amount (money out). No sign inversion — 4-col is correct as-is.
- ⚠️ Description is `Vendor — Category`; contains an **em dash (—)**, non-ASCII → ensure the
  file is served/saved **UTF-8**; consider a plain hyphen for maximum importer compatibility.
- ⚠️ **[real-import test]** Commas inside Description are CSV-quoted by `csvCell` — QBO's
  importer is strict; confirm it accepts quoted fields.
- ⚠️ Date is hard-coded MM/DD/YYYY — correct for US orgs, wrong for others.
- Low: 350 KB cap — fine for normal accounts; unbounded output could exceed it.

## Xero — bank-statement CSV import
Spec: `Date, Description, Amount` (or 4-col `Date, Description, Debit, Credit`); min Date +
Amount; **negative = money out**; date matches org region (US = MM/DD/YYYY); **UTF-8
required**; *precoded* imports add `ContactName, AccountCode, TaxType` for auto-categorization.

Our `generateXeroCSV` — header `Date, Amount, Payee, Description`:
- ❌ **Column mismatch (highest-priority export finding).** Xero expects `Date, Description,
  Amount`; our order (`Date, Amount, …`) and the non-standard **"Payee"** column don't match.
  Xero uses `ContactName` for the payee, not "Payee". This likely forces a manual re-map at
  best, or fails at worst. **[real-import test]** to confirm severity, but the header set is
  wrong on paper.
- Sign ✓ (`-abs`, negative = money out). Date ✓ for US orgs.
- ⚠️ UTF-8 + em dash — same encoding flag.
- **Opportunity:** Xero's **precoded** format (`ContactName, AccountCode, TaxType`) would carry
  our `expense_category` as a real account/tax code → a categorized import. We don't use it.

## Cross-cutting conceptual finding (both tools)
These CSVs are **bank-transaction imports** — they bring raw lines in to be categorized
*inside* QBO/Xero. They do **NOT** ingest our `expense_category` as an accounting account; the
category rides along only in the memo/Description. So "export to QuickBooks/Xero" delivers
transactions, not categorized expenses. If users expect their AVIntelligence categories to land
as QBO/Xero categories, that's an **expectation gap**. Product copy ("import-ready files, clean
data") is accurate but must not imply categories transfer. Xero's precoded path is the only one
that could carry categories.

## Feeds the accuracy skill (export pillar checklist)
For every export target: header names + order match spec · date format · **sign/direction of
money** · encoding (UTF-8) · delimiter/quoting acceptance · size cap · and a **real sandbox
import** as the final gate. Never assume — confirm with an import.

## Recommended follow-ups (for review/Codex, not yet actioned)
1. Fix the **Xero header/order** to `Date, Description, Amount` (+ consider a precoded variant
   with `ContactName, AccountCode, TaxType`).
2. Confirm/‌fix **QB 4-col Debit/Credit** direction via a real import.
3. UTF-8 guarantee + consider replacing the em dash with a hyphen in Description.
4. Decide the intended story on **categories** (memo-only vs a categorized-import path).

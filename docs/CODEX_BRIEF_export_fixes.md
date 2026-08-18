# Codex Brief — Accounting export format fixes (QuickBooks / Xero)

From the P1 export-format review (`docs/P1_export_format_findings.md`). These change
`lib/accounting-csv.ts`. **Material change (export logic) — plan for review; some items are
gated on a real sandbox import (QBO/Xero test accounts) before shipping.** Do not ship export
format changes on docs alone; confirm with an actual import.

## 1. Xero header/order — fix (highest priority)
Current `generateXeroCSV` emits `Date, Amount, Payee, Description`. Xero's documented bank-
statement import is `Date, Description, Amount`, and "Payee" is not a Xero column (Xero uses
`ContactName`). Change to the documented shape:
- Columns: `Date, Description, Amount` (Description = vendor + category as today; Amount keeps
  the current negative-for-money-out sign, which is correct).
- Consider an **optional precoded variant** (`ContactName, AccountCode, TaxType`) later — that's
  the only Xero path that carries our `expense_category` as a real account/tax code. Not now;
  note it.
- Verify with a real Xero import before shipping.

## 2. Encoding — fix (safe)
Descriptions contain an em dash (—). Guarantee the export is UTF-8 on the wire (response
`Content-Type: text/csv; charset=utf-8`), and — for maximum importer compatibility — replace the
em dash in the `Vendor — Category` description with a plain hyphen or colon (`Vendor - Category`).

## 3. QuickBooks 4-column sign — VERIFY before any change (gated)
3-column export is confirmed correct (negative = money out — matches QBO). The 4-column export
places the expense amount in the **Debit** column. Whether QBO reads Debit as money-out is
**not confirmed from docs** — it must be checked with a real QBO import. Do NOT alter it blindly;
if a test shows expenses import as income (Credit = money-out in QBO's mapping), swap the column.
Until verified, treat 4-col as unconfirmed.

## 4. Category expectation — product decision (no code yet)
These CSVs are bank-transaction imports; QBO/Xero categorize inside their tools and do NOT ingest
our `expense_category` as an account (it rides in the memo only). Decision for owner: keep memo-
only (and never imply categories transfer), or build a categorized path (Xero precoded / a QBO
bill-import template). Hold until decided.

## Verify (per item)
- `npm run build`; existing `scripts/test-accounting-csv.ts` updated for the new Xero header.
- Real sandbox import into Xero (item 1) and QBO 4-col (item 3) — the required final gate.
- 3-col QBO unchanged and still imports clean.

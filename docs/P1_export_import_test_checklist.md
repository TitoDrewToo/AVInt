# P1 — Export real-import test checklist (QuickBooks + Xero)

Purpose: confirm how QBO and Xero *actually* interpret our export files — the required final
gate for the export pillar. Test files (generated from real account data, 37 rows) are in the
outputs folder: `test_quickbooks_3col.csv`, `test_quickbooks_4col.csv`, `test_xero.csv`.

Accounts (all free): QuickBooks — Intuit Developer **sandbox** company or a 30-day QBO trial.
Xero — a 30-day trial with its built-in **Demo Company**.

## QuickBooks Online
1. Banking/Transactions → **Upload from file** → choose `test_quickbooks_3col.csv` → map
   Date/Description/Amount → import.
   - ✅ Check: each row imports as **money OUT** (a decrease/negative), correct date, correct amount.
2. Repeat with `test_quickbooks_4col.csv`.
   - ⭐ **Critical check:** the amounts sit in the **Debit** column — confirm they import as
     **money OUT**, not deposits. If they show as money IN, our 4-col sign is inverted and we
     swap Credit/Debit. (This is the one unresolved export item.)

## Xero
1. Accounting → Bank accounts → pick an account → **Manage → Import a statement** → upload
   `test_xero.csv` → map Date/Description/Amount → import.
   - ✅ Check: rows import as **spent / money out** (negative), correct date, and Description shows
     "Vendor - Category".
   - Note any column-mapping friction (the header is now Xero's documented `Date,Description,Amount`).

## Report back (per tool)
- Did it import without errors?
- Are expenses money-OUT (correct direction)?  ← the key question, esp. QB 4-col.
- Any mapping friction or rejected rows?

## Then
- If QB 4-col shows expenses as money-in → swap Credit/Debit in `generateQuickBooksCSV` (Codex).
- If all money-out → export pillar confirmed; mark done.
- Unrelated but found during this pass: the MCP export limit bug (paid tiers capped at 1/month) —
  tracked separately.

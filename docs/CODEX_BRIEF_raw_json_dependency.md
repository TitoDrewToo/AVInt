# Codex brief — remove the `_raw_json` dependency from report classification

Reprocessing a document now deletes its `_raw_json` attribute. Two report
paths still read it. Neither is breaking today — that was verified, not
assumed — but one of them is guaranteed to break the first time a payslip is
reprocessed.

Scope: `lib/document-classification.ts`, `app/api/reports/[report]/route.ts`,
`lib/report-engine.ts`. **No migrations.**

## Why `_raw_json` is going away

The new extraction payload allowlist no longer writes it. Confirmed in
production: the reprocessed receipt lost it, and 39 of 263 records still carry
it. Those 39 will drain as they are reprocessed. This is the intended
direction — raw model output does not belong in the record layer — so the fix
is to remove the dependency, **not** to restore the attribute.

## Dependency 1 — document classification

`lib/report-engine.ts:142` reads the `_raw_json` attribute onto the tax row.
`rowDocumentType` in `document-classification.ts` then prefers the model's own
`gemini_document_type` / `gemini_raw.document_type` over the typed
`document_type`:

```ts
return stringValue(rawObject?.gemini_document_type)
    ?? stringValue(contentType)
    ?? stringValue(row.document_type)
```

That feeds `classifyRow` → `isExpenseRow` → the tax bundle
(`lib/tax-bundle.ts:297`), the business-expense report
(`report-engine.ts:175`), the QuickBooks/Xero export
(`report-export-shaping.ts`), and the dashboard (`smart-dashboard.ts`).

**Fix: prefer the typed value, use raw only as a fallback.** Invert the
precedence:

```ts
return stringValue(row.document_type)
    ?? stringValue(rawObject?.gemini_document_type)
    ?? stringValue(contentType)
```

This follows the rule the record layer already runs on — **provenance beats
inference.** A typed column we derived deliberately should outrank a raw model
field we happened to retain.

### Prove it is a no-op before changing it

Two records in production disagree between the two sources: raw says
`transaction_record`, typed says `receipt`. Every other record agrees or has
no raw type at all.

Both `receipt` and `transaction_record` are in `EXPENSE_DOCUMENT_TYPES`, so
`classifyRow` returns `"expense"` either way and no report output moves.
**Assert that in a test** — a row whose raw and typed types differ across
those two values classifies identically before and after. If you find a case
where the classification does change, stop and report it rather than shipping.

## Dependency 2 — the payslip `total_amount`, which will break

`app/api/reports/[report]/route.ts` around line 232:

```ts
const rawTotal = parsedRaw && typeof parsedRaw === "object" ? parsedRaw.total_amount : null
...
total_amount: documentType === "payslip" ? rawTotal : row.amount,
```

With `_raw_json` gone, `rawTotal` is `null`, so **every reprocessed payslip
renders a blank `total_amount` in the income report** while still counting in
the totals. That is the exact defect found during the report cutover — a row
displaying blank while contributing ₱48,500.

**Fix: drop the special case.** `total_amount` should be `row.amount` for
payslips as it is for everything else.

## Also check this, and report rather than fixing blind

The same block does:

```ts
net_income: documentType === "payslip" ? row.amount : fields.get("net_income") ?? null,
```

`b8db821` changed `records.amount` for payslips from **net to gross**. If this
route was not updated at the same time, it now reports **gross in the
`net_income` column**. There are currently zero payslip records in production,
so this cannot be verified against data.

Do not change it on assumption. Read the code, state what you believe it does
now, and report. Andrew will re-upload a payslip so Claude can verify against
the database before anything is altered — this is report math and it needs
evidence, not reasoning.

## Verification

`pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`.

Unit tests:

- a row with raw `transaction_record` and typed `receipt` classifies as
  `expense` under both the old and new precedence
- a row with no `raw_json` classifies from its typed `document_type`
- a payslip row's `total_amount` equals `row.amount` and is never null when
  `row.amount` is set

Then run `scripts/report-parity.ts`. **Expect zero diffs.** If the tax bundle
or business-expense output moves at all, the precedence change is not the
no-op we measured — stop and report.

Do not push until Andrew has seen your report.

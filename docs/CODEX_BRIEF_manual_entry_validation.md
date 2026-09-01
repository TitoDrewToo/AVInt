# Codex brief — manual entry: validation and currency

Follow-up to the manual-entry record flow. The shape is right; this makes the
inputs trustworthy.

Scope: `lib/document-type-fields.ts`, `components/ui/document-modals.tsx`, and
one new currency module. No migrations.

## The governing principle

**Never block an entry a user can only partially provide.** Accept it, flag
it, and let `needs_review` carry the signal. A user who half-remembers a
receipt should be able to save it; if the form refuses, they abandon the
entry and we have nothing instead of something imperfect.

So the required set is deliberately small — only what makes a record
*countable*.

## 1. Required fields

- **`document_date` — always required.** Without a date a record cannot be
  placed in any period, so no report can use it.
- **Amount — required for financial types** (`receipt`, `invoice`,
  `payslip` via `gross_income`, `bank_statement`, `income_statement`,
  `tax_document`). NOT required for `contract`, `agreement`, or
  `general_document`, which legitimately have no amount.
- **Currency — required whenever an amount is entered, and only then.**

Everything else is optional. Do not add required flags beyond this list; a
field that is merely useful is not a field worth blocking on.

### Amount and currency are one fact in two boxes

An amount without a currency is meaningless and breaks the FX conversion into
`amount_base`. Enforce the pair in both directions: entering an amount makes
currency required; clearing the amount releases it.

## 2. Input validation — enforce, do not merely hint

`input: "number"` currently only shapes the control. Add real parsing:

- reject non-numeric input rather than silently coercing
- allow decimals
- **allow negatives.** Refunds and credits are real, and the spreadsheet
  ingest already handles parenthesised negatives — manual entry should not be
  stricter than the importer
- respect the currency's decimal places (see §3)

`input: "date"`:

- must parse as a real date; reject `2026-02-31`
- a `document_date` in the future **warns, does not block** — a contract's
  `period_end` is legitimately future, and a user may be recording something
  dated ahead
- `period_end` before `period_start` warns

`input: "text"`: cap length (200 for names, 2000 for description). Defence in
depth, matching the constraints already on the Chroma Fairy inquiry table.

Show validation inline as the user types, not only on submit.

## 3. Currency

A selector, not detection — there is nothing to detect from when a person is
typing.

New module `lib/currencies.ts`:

```ts
export const SUPPORTED_CURRENCIES = [
  { code: "USD", label: "US Dollar",          symbol: "$",  decimals: 2 },
  { code: "PHP", label: "Philippine Peso",    symbol: "₱",  decimals: 2 },
  { code: "EUR", label: "Euro",               symbol: "€",  decimals: 2 },
  { code: "GBP", label: "Pound Sterling",     symbol: "£",  decimals: 2 },
  { code: "AUD", label: "Australian Dollar",  symbol: "A$", decimals: 2 },
  { code: "JPY", label: "Japanese Yen",       symbol: "¥",  decimals: 0 },
] as const
```

**`decimals` is not decoration.** JPY has no minor unit — ¥100, never
¥100.00. Use it for the input's step, for display formatting, and for
rounding. Getting this wrong produces a display bug and a rounding bug from
the same line of code.

**Default the selector to the user's most recently used currency**, falling
back to `USD`. One query against their most recent record; do not hardcode a
single default for everyone.

Do not restrict *stored* currencies to this list — extraction may legitimately
produce others, and a record with an unlisted currency must still display. The
list governs the manual entry selector only.

## Verification

`pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`.

Add unit tests for the validation rules — these are pure functions and should
be tested directly rather than through the form:

- `"1,234.56"` → 1234.56 · `"(45)"` → −45 · `"abc"` → rejected
- JPY amount `100.5` → rejected or rounded per your chosen rule; say which
- `2026-02-31` → rejected · a future `document_date` → warning, not rejection
- amount present with no currency → invalid; both absent → valid
- a contract with no amount → valid

You cannot test the live form. Andrew will create one entry of each type and
Claude will verify the database. State plainly that you did not run it.

Do not push until Andrew has seen your report.

# Codex brief — derivation contract: stop losing counterparties

Two defects in `_shared/field-mapping.ts` / `_shared/derive-records.ts`,
found by the report parity harness. Both cause silent data loss.

Scope: `_shared/field-mapping.ts`, `_shared/derive-records.ts`,
`_shared/persist-derived.ts`. Nothing else. Write no migrations.

## Context from a full review of the mapping contract

Claude reviewed every mapping against production. The contract is sound apart
from what follows — this is not the first two of ten:

- Only **two** record columns can be written by more than one extracted
  field: `amount` (from `total_amount`, `net_income`) and `counterparty`
  (from `vendor_name`, `employer_name`). Both are addressed here.
- Seven `document_fields` columns are unmapped but **empty in all 89 rows**
  and empty inside `raw_json` — no loss. Leave them.
- `confidence_score` reaches `records.confidence` on 89 of 89 rows with zero
  mismatches. Do not touch it.

## 1. A null must never overwrite a populated value

When two extracted fields map to the same record column, the later mapping
currently wins even when its value is null.

Live consequence: the 2026-03-03 payslip has `vendor_name = "Creative Design
Studio"` and `employer_name = null`. Both map to `counterparty`. The null won.
`records.counterparty` is NULL and the name exists nowhere in the record
layer.

**First non-null wins.** Apply it generally to every multi-source column, not
as a payslip special case — the same hazard exists for `amount`
(`total_amount` / `net_income`) and for any mapping added later.

## 2. The party that does not win must be preserved

`counterparty` is one slot, and `vendor_name` and `employer_name` are
sometimes **different parties**, not two names for one.

Live consequence: the 2026-01-15 contract has `vendor_name = "Andrew Vincent
Niloban"` and `employer_name = "Horizon Digital Inc."`. Vendor won.
"Horizon Digital Inc." is gone.

Whichever name does not become `counterparty` must be written to
`record_attributes` under its own key (`vendor_name` or `employer_name`).
Nothing is discarded — the same rule the record layer already claims to
follow.

Do **not** add a column and do not invent a role enum. The attribute plus
`record_type` is enough for a consumer to know which is which.

## 3. Populate `value_numeric` on write

`record_attributes.value_numeric` exists (migration `20260901014949`) and is
backfilled, but nothing populates it for new rows.

In `persist-derived.ts`, when `value_type === "number"`, set `value_numeric`
to the parsed number. If it does not parse cleanly, leave it null — never
throw, never guess. This is what makes named measures (`gross_income`,
`net_income`, `tax_amount`) summable in Postgres.

## What this brief does NOT do

Do not change the payslip `amount` mapping. Andrew has decided payslips will
contribute **gross** rather than net, but that lands as its own change after
report parity is proven, with a visible before/after — it moves reported
income by ₱9,975 and must not be buried inside a correctness fix.

## Verification

`pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, Deno type-check, deploy
with `--no-verify-jwt`.

Add fixture cases to `scripts/test-derive-records.ts`:

- `vendor_name` populated, `employer_name` null → `counterparty` is the
  vendor name, no null overwrite
- both populated and different → `counterparty` is one of them, the other is
  present as an attribute under its own key
- both null → `counterparty` null, no attributes written
- a numeric attribute → `value_numeric` set; an unparseable one → null, no
  throw

Report the fixture results. Existing records need re-deriving to recover the
two lost names — Claude drives that from the database. Do not attempt it.

Do not push until Andrew has seen your report.

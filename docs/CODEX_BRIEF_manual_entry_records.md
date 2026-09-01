# Codex brief — manual entry must produce records

A hand-entered document currently reaches `document_fields` and the legacy
virtual layer, and never produces a `records` row. Since all seven reports now
read `records`, a manual entry would be **invisible in every report** — a user
types in a receipt they lost and it never appears in their tax bundle.

Zero manual entries exist in production today, which is the only reason report
parity passed at zero. The gap is latent, not live.

Scope: `components/ui/document-modals.tsx`, plus one new shared module. Write
no migrations — no schema change is needed.

## Part 1 — the floor (non-negotiable)

A manual entry must go through the **same derivation path** as an upload.

`records.extraction_id` is NOT NULL, and that is correct rather than an
obstacle: write a real `extractions` row for the manual entry, with
`provider = 'manual'`, `model = null`, `attempt_number = 1`, and the entered
values as the payload. `extractions` then means *the structured claim made
about this file, and by whom* — model or person — and the audit trail comes
for free.

Sequence:

1. `files` row, as today (`file_type: 'manual'`)
2. `document_fields` row, as today (`normalization_status: 'manual'`)
3. **NEW:** an `extractions` row, `provider = 'manual'`
4. **NEW:** `deriveRecords(...)` then `persistDerived(...)`, exactly as the
   ingestion path does

**Remove nothing.** Keep the `document_fields` write and the
`/api/virtual-records/sync` call unchanged — manual entries appear in the data
model view through the virtual layer today, and that layer dies later with M4,
not here. Both paths run, same discipline as the report cutover.

`source_key` is `'root'` for a manual entry. Re-editing the same manual entry
must upsert on `(file_id, source_key)`, not create a second record.

`provider = 'manual'` is the provenance marker. Do not infer manual-ness from
a null, a missing field, or the file type — an explicit discriminator, because
inference is what put `vendor_name` and `employer_name` in a fight over one
column.

## Part 2 — the form takes its shape from the document type

Add a document-type selector that changes which fields are offered.

**The field set per type must come from a single shared definition**, used by
both this form and anything else that needs to know what a type contains. Do
not hardcode a second list inside the component. Put it in
`lib/document-type-fields.ts` (or similar — say what you chose) and derive it
from, or keep it explicitly consistent with,
`supabase/functions/_shared/field-mapping.ts`.

Starting sets — extend rather than redesign:

```
receipt    counterparty, date, amount, currency, category, tax amount
invoice    counterparty, invoice number, date, amount, currency
payslip    employer, period start, period end, gross income, net income
contract   counterparty, period start, period end, amount, currency
other      counterparty, date, amount, currency, description
```

**Anything the user enters that has no typed column becomes a
`record_attribute`.** That is the extension point — a numeric one is summable
via `value_numeric`, so a field we never anticipated still works in a report.
Do not add columns for new field ideas.

Andrew expects this UI to be revised later. Build for a stable floor, not a
final design: the derivation contract and the shared field definition are the
parts that must not need rewriting.

## Verification

`pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`.

You cannot test the live flow — it needs a signed-in browser. Andrew will
create a manual entry of each type and Claude will check the database. State
plainly that you did not run it.

What Claude will check:

- one `files` row, one `document_fields` row, one `extractions` row with
  `provider = 'manual'`, and exactly one parent `records` row
- the record carries the entered date, amount, currency, counterparty and
  category in its typed columns
- a field with no typed column appears as a `record_attribute`, with
  `value_numeric` set when numeric
- re-editing the entry updates the record rather than creating a second
- `needs_review` is false when a date and an amount were entered

Do not push until Andrew has seen your report.

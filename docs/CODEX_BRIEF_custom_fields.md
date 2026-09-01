# Codex brief — user-defined fields on manual entry

The record layer already stores anything the typed columns do not cover: any
key not in `FIELD_MAPPINGS` becomes a `record_attribute`, and numeric ones get
`value_numeric` so they are summable in a report. There is no UI to reach it.

Build the UI. **No new storage mechanism is needed** — that is the point of
the design, and adding one would be the wrong move.

Scope: `components/ui/document-modals.tsx`, `lib/document-type-fields.ts`,
`_shared/persist-derived.ts` (one fix, see §6). No migrations.

## 1. The affordance

Below the type-specific fields, on **every** document type: **`+ Add field`**.

Each custom field is three inputs on one row:

```
Label            Type              Value
Warranty months  [Number ▾]        24
```

Type options: **Text**, **Number**, **Date**. Nothing else — those three cover
what the attribute layer can type, and a fourth would be a claim we cannot
back.

Cap at **10 custom fields per entry**. Show a remove control on each row.

## 2. Label becomes a stable key

`"Warranty months"` → `warranty_months`. Deterministic, snake_case, lowercase,
non-alphanumerics collapsed to underscores, trimmed.

**Reject a label whose key collides with a mapped field.** If a user types
"Amount" or "Vendor name", tell them that field already exists above rather
than creating a shadow `amount` attribute that fights the typed column. The
collision list is every `extractionField` in `document-type-fields.ts` plus
every `extracted` key in `FIELD_MAPPINGS`.

Also reject a label that normalises to an empty key, and two custom fields
that normalise to the same key within one entry.

## 3. Offer the user their own previous fields

This is what separates a usable feature from a novelty. Without it the same
concept becomes `warranty months`, `Warranty Months` and `warranty_mo`, and
none of them aggregate.

When the user opens `+ Add field`, suggest keys they have used before:

```sql
select distinct field_key from record_attributes
where user_id = $1 and field_key not in (<mapped keys>)
order by field_key
```

Present them as a datalist or dropdown on the Label input — selectable, but
still free-typed. Show the label they originally used, not the raw key, if you
can recover it; otherwise humanise the key.

## 4. It rides the existing derivation path

Put each custom field into the extraction payload as `key: value`, alongside
the mapped fields. `attributesFor` in `derive-records.ts` picks up anything
unmapped, and `persistDerived` writes `value_numeric` for numbers. Do not add
a separate write path, and do not touch `field-mapping.ts`.

Coerce before adding to the payload: Number → a JavaScript number, Date →
`YYYY-MM-DD` string, Text → string. A value that fails to coerce blocks the
save with an inline message; it must not be silently stored as text under a
numeric label, because that produces a field that looks summable and is not.

## 5. Validation

Same rules as the typed fields: numbers parse (commas, decimals, negatives,
parentheses), dates must be real dates, text capped at 200 for the label and
2000 for a value. Validate inline as the user types.

An empty value with a filled label is invalid — remove the row instead.

## 6. Removing a custom field must remove the attribute

`persistDerived` upserts attributes on `(record_id, field_key)` but never
prunes. So if a user edits an entry and deletes a custom field, the attribute
survives and keeps appearing in reports — the same defect class as the stale
child records fixed earlier.

After upserting a record's attributes, **delete that record's attributes whose
`field_key` is not in the current derivation**. Guard it the same way as the
child pruning: if the derived attribute set is empty, delete nothing and log
it — an empty derivation is more likely a failure than a genuine clearing.

## Verification

`pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, Deno type-check, deploy
the edge functions with `--no-verify-jwt`.

Unit tests for the pure parts:

- `"Warranty months"` → `warranty_months`
- `"Amount"` → rejected as colliding with a mapped field
- `"!!!"` → rejected as an empty key
- two fields normalising to the same key → rejected
- Number `"1,234.56"` → 1234.56 · Number `"abc"` → blocks the save
- removing a field from an entry prunes its attribute; an empty derived set
  prunes nothing

You cannot test the live form. Andrew will create one receipt with a numeric
custom field and Claude will verify the database. Say plainly that you did not
run it.

Do not push until Andrew has seen your report.

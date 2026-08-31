# Codex brief — ingestion phase 1b: line-item collapse and pruning

Follow-up to phase 1 (`236e135`). Two defects found by the first real
multi-row ingestion, verified against production data.

Scope: `supabase/functions/_shared/derive-records.ts` and
`supabase/functions/_shared/persist-derived.ts`. Do not touch anything else.
Claude handles all database changes and cleanup — write no migrations.

## What the test showed

File `expenses-2026-h1.csv`, 20 flat expense rows, ingested successfully:

- 20 `document_fields` rows, `source_key` `"0".."19"` — correct
- 20 parent records, amounts summing to exactly 3769.22 — correct
- 21 extractions (1 whole-file + 20 per-row slots), no races — correct
- **20 line-item children, amounts also summing to 3769.22 — wrong**

The header mapper turned the CSV's `Description` column into a one-entry
`line_items` array carrying the row's own amount:

```json
[{"amount": 49, "quantity": null, "description": "Design subscription", "unit_quantity": null}]
```

Derivation faithfully created a child per line item. The result is double the
record count, meaningless children, and 7538.44 for any query that forgets
`parent_record_id is null`.

## 1. Collapse a line item that only restates its parent

In `derive-records.ts`, before creating children:

If the `line_items` array has **exactly one** entry, and that entry's amount
is equal to the parent record's amount, do not create a child record. Instead
merge the entry's non-null fields onto the parent as attributes — at minimum
`description`, and any other keys present.

Compare amounts numerically with a small tolerance (0.005) rather than by
string or strict float equality. If the parent amount is null or the entry
amount is null, **do not collapse** — an unknown is not a match.

Arrays of two or more entries are always a genuine itemisation. Never collapse
those, even if the amounts happen to sum to the parent.

This is correct for a real single-item receipt too: one item for the full
amount is one business event, and the child contributes nothing but a
duplicate number. The description must survive as a parent attribute.

## 2. Prune children that derivation no longer produces

`persist-derived.ts` upserts what derivation produced, but never removes what
it did not. Stale children survive forever.

After upserting a file's records, delete child records for that file whose
`source_key` is not in the current derived set. Scope the delete to
`parent_record_id is not null` — never delete parents this way, since a file's
parent set is the file's identity and an empty derivation should not wipe it.

If the derived set for a file is empty, delete nothing and log it. That is
more likely a derivation failure than a genuinely empty file, and silently
erasing a user's records on a bad extraction is unacceptable.

This is a general correctness property, not specific to this bug: a
re-extraction that finds three line items where it previously found five must
leave three.

## Verification

`pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, Deno type-check, then
deploy with `--no-verify-jwt`.

Add a case to `scripts/test-derive-records.ts` covering:

- one line item equal to the parent amount → no child, description present as
  a parent attribute
- one line item with a *different* amount → child created (a genuine partial)
- two line items → both children created
- null parent amount with one line item → child created, no collapse

Report the fixture results. You cannot re-ingest the CSV — that requires a
signed-in browser upload. Andrew will re-run it and Claude will check the
database. Do not report the live result as observed.

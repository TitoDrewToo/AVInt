# Codex brief — ingestion path, phase 1

Make the ingestion path correct for multi-row inputs. Nothing here is a
feature; all of it is correctness work on a path that has never actually run.

## Context you need

Smart Storage has processed 44 files. Every one produced exactly **one**
`document_fields` row. No spreadsheet has ever been ingested. The `records`
layer holds 266 rows, all written by a one-off backfill on 30 Aug — never by
live ingestion.

So the multi-row path is unexercised, not broken-in-production. You are
fixing defects before they fire, and you cannot rely on existing data to
tell you whether something works.

**Terminology.** `document_fields`, `virtual_records` and
`virtual_record_fields` are legacy and will be removed later — do not build
on them, do not remove them now. `records` and `record_attributes` are the
target. The phrase "virtual model" still names a user-facing feature and must
not be deleted; only the tables behind it change, later, not in this pass.

## Standing rules

- Do not touch the seven report pages, the dashboard, or the MCP server.
- Do not drop or alter any legacy table.
- Do not run migrations. Claude applies all database changes. Migration
  `document_fields.source_key` (below) will already be applied before you
  start — treat the column as existing.
- If a stated fact here turns out to be wrong, stop and report rather than
  adapting. These are hypotheses from a code audit, not verified truths.

---

## 1. `source_key` collapses to "root" on the normalize fan-out

**The defect.** `_shared/derive-records.ts:186` computes
`source_key = "root"` when the extraction it receives is a single object
rather than an array.

`process-document` passes the whole array of N rows, so derivation produces
`"0".."N-1"`. Correct. Then `process-document` invokes `normalize-document`
**once per row**, and each invocation passes a single object — so every one
derives `source_key = "root"` and upserts onto the same row via
`onConflict: (file_id, source_key)`.

A 200-row spreadsheet would end up with 201 parent records: 200 correct ones
that never receive their normalized values, plus one race-winner.

**The fix.** Row identity must survive the fan-out.

- `document_fields` now has a `source_key text` column (applied by Claude).
  When `process-document` inserts its N rows, set `source_key` on each to the
  same value derivation uses: `"root"` for a single-row document, otherwise
  the row index as a string.
- When `process-document` invokes `normalize-document`, pass that row's
  `source_key` in the request body.
- `normalize-document` must pass it through to `deriveRecords` so the derived
  record keeps its identity instead of recomputing it from shape.
- `deriveRecords` should accept an explicit `sourceKey` option and use it when
  provided, falling back to the current shape-based logic when absent.

Do not infer the key from array length inside `normalize-document`. Pass it
explicitly. Shape-based inference is the bug.

## 2. `writeExtraction` races under the fan-out

`_shared/write-extraction.ts` reads the current max `attempt_number` and then
inserts, against `unique (file_id, attempt_number)`. Executed N ways in
parallel for the same file, most invocations collide and throw.

Replace read-then-insert with something atomic. Either derive the attempt
number in a single statement, or upsert on a deterministic key. State which
you chose and why.

## 3. Internal columns leak into `record_attributes`

`normalize-document` derives from the full `document_fields` row:

```ts
const extractionPayload = { ...normalizedRow, document_type: ... }
```

`normalizedRow` is the whole database row, so `id`, `file_id`, `created_at`,
`raw_json`, `normalization_status`, `normalization_attempts`,
`normalization_version`, `normalized_at` and `normalization_batch_id` all
become user-visible attributes. `record_attributes` is owner-readable under
RLS. `reprocess-documents` has the identical bug.

Build an explicit payload containing only extraction fields. Do not fix this
by extending the `META_FIELDS` denylist — an allowlist of extraction fields is
the correct shape, because the next column added to the table would otherwise
leak too.

## 4. `needs_review` is false on empty records

`derive-records.ts` only evaluates `needs_review` for types in
`FINANCIAL_TYPES`. A `general_document` record with no `occurred_on`, no
`amount` and no typed attribute is silently accepted as complete.

Change the rule: a record needs review when it has **no `occurred_on` and no
numeric value of any kind**, regardless of `record_type`. Financial types keep
their existing stricter checks on top.

## 5. Re-processing duplicates `document_fields`

`process-document` inserts with no dedupe key, and the retry path re-invokes
it. With `source_key` now present, `(file_id, source_key)` is unique — switch
the insert to an upsert on that pair.

**Do not delete-then-insert.** User corrections live in `document_fields`
today with no history anywhere, so a delete destroys them irrecoverably.

Also move the `avint_claim_document_processing` call so a file is not charged
against the plan limit when the extraction insert subsequently fails.

---

## Verification

`pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, and Deno type-check the
edge functions before deploying anything.

Then prove the multi-row path with a real file — this is the part that
matters, because none of it has ever run:

1. Ingest a CSV of at least 20 rows.
2. Confirm `document_fields` has 20 rows with `source_key` `"0".."19"`.
3. Confirm `records` has exactly 20 parent rows for that file, each with a
   distinct `source_key`, and **no** row with `source_key = 'root'`.
4. Confirm no `record_attributes` row has `field_key` in
   (`id`, `file_id`, `created_at`, `raw_json`, `normalization_status`).
5. Re-run processing on the same file and confirm the row counts do not
   change.

Report the actual counts you observed at each step. If you cannot run a step,
say which and why — do not describe expected behaviour as observed.

Do not push until Andrew has seen the counts.

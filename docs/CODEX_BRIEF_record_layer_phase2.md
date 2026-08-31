# CODEX BRIEF — record layer, phase 2 (persistence, backfill, edge functions)

Follows `docs/CODEX_BRIEF_record_layer.md`, sections 1-2 of which are DONE
and verified. Issued 27 Aug 2026.

## Already done by Claude — do not repeat

- **M1**: `extractions`, `records`, `record_attributes`, `record_revisions`
  created, RLS on, owner-read only, no anon grants.
- **M2**: `payment_obligations.record_id` added (nullable, FK to records).
- **M3a**: 44 rows seeded into `extractions` from `document_fields`, payload
  built from the typed columns so the keys match `field-mapping.ts` exactly.
  `_raw_json` carried under a reserved key. `source_row_count` populated.

**Current state: 44 extractions, 222 line items between them, 0 records.**

Expected after backfill: **44 parents + 222 children = 266 records.**
If your run produces 44, fan-out is not working. If it produces 266, it is.

Do not apply M4 (dropping old tables). Claude applies that last.

## 1. Persistence — `persistDerived`

`deriveRecords` is pure and returns records carrying `source_key` and, for
children, `parent_source_key`. **`parent_record_id` is always null on the way
out.** Resolving it is the persister's job.

```
persistDerived(client, extractionId, derived) -> { inserted, updated }
```

Order is not optional:

1. Upsert parents (those with no `parent_source_key`) on
   `(file_id, source_key)`
2. Read back their ids, build a `source_key -> id` map
3. Upsert children with `parent_record_id` resolved from that map
4. Upsert `record_attributes` on `(record_id, field_key)`
5. Apply the override pass (section 2 below) **last**

**If step 3 is skipped or fails silently, every line item becomes a
top-level record and every receipt double-counts.** The partial indexes on
`parent_record_id is null` cannot protect against this — it arrives through
the one door they do not cover. Assert it: after persisting, the count of
records with a non-null `parent_record_id` must equal the number of derived
children.

Deleting a file cascades to records and attributes. `extractions` is NOT
deleted — ever. It is the audit trail and the rebuild source.

## 2. The override overlay

User corrections live in `record_revisions` with `change_kind = 'user_edit'`.
They are an **overlay, never an in-place mutation**.

`applyOverrides(client, recordIds)` runs last in every persistence path. A
record's current value is *the latest derivation with user edits re-applied
on top*. Set `has_user_edits` true on any record carrying one.

Without this, reprocessing silently destroys every correction a user made.
Not optional, not a later stage.

## 3. Backfill script — `scripts/backfill-records.ts`

Runs `deriveRecords` + `persistDerived` over all 44 seeded extractions.

- Idempotent: running twice leaves 266 records, not 532
- Reports counts: extractions processed, parents, children, attributes,
  records flagged `needs_review`
- Dry-run flag that prints the plan without writing

Run it, report the numbers, and stop for review before touching edge
functions.

## 4. Edge functions — only after the backfill is verified

Same AI calls, same providers, same telemetry. Only the tail changes.

**`process-document`, `normalize-document`, `reprocess-documents`**: write an
`extractions` row (`attempt_number` incrementing per file, `provider`,
`model`, raw `payload`), then `deriveRecords`, then `persistDerived`.
Keep writing `document_fields` as well — dual-write until M4.

**`analyze-spreadsheet`**: must emit the **full row array** in the extraction
payload instead of a summarised object, and set `source_row_count`. This is
where sheets currently collapse. A 200-row CSV becoming 200 records is the
point of the entire rework.

**`generate-advanced-analytics`, `generate-rd-analytics`,
`generate-context-summary`**: switch reads to `records`. **Filter
`parent_record_id is null` in every aggregate.** Cap every read.

**Unchanged**: `prescan-document`, `diagnose-error`, `fx-backfill`.

Every `[functions.*]` needs `verify_jwt = false`; deploy `--no-verify-jwt`.

## 5. Migration file parity

Write migration files matching M1, M2 and M3a into `supabase/migrations/`
with **unique version numbers**, guarded with `if not exists`. They are
already applied live — these are for repo parity and fresh-environment
replay only. **Never run `db push`**: the repo has eight colliding version
prefixes and 18 files absent from migration history.

## Verification — report each with numbers

1. Backfill: 44 extractions -> 44 parents + 222 children = 266 records
2. Re-run backfill: still 266, not 532
3. `select count(*) from records where parent_record_id is not null` = 222
4. `select sum(amount) from records where parent_record_id is null` does not
   include line-item amounts
5. Upload a receipt: 1 extraction, 1 parent, N children
6. Upload a 200-row CSV: 1 extraction, 200 top-level records; re-upload,
   still 200
7. Edit a field, reprocess, edit survives, `has_user_edits` true
8. `pnpm build`, `pnpm lint`, `pnpm exec tsc --noEmit`

## Standing rules

- No browser driving, no network probing, no permission escalation.
  Unavailable tool -> report and stop.
- Never run `db push`. Never apply M4.
- No client-side `supabaseAdmin`.
- Every read bounded.
- Build before push.
- Conflict with the codebase -> stop and say so. Do not resolve it yourself.

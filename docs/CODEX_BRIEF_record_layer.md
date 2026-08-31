# CODEX BRIEF — Smart Storage record layer

Repo: `/Users/avin/Documents/AVINTELLIGENCE/avint`
Issued 27 Aug 2026.

## Already done — do not repeat

**Migration M1 is applied to the live database.** Four new tables exist,
verified: `extractions`, `records`, `record_attributes`, `record_revisions`.
RLS enabled, one owner-read policy each, no permissive policies, no anon
grants, `authenticated` has SELECT only.

Write the matching migration file into `supabase/migrations/` with a
**unique version number** for repo parity, guarded with `if not exists` so a
replay is safe. The repo has eight colliding version prefixes and 18 files
absent from migration history — **never run `db push`.**

M2 (relink `payment_obligations`), M3 (backfill) and M4 (drop old tables)
are applied by Claude. Do not apply them.

## What must NOT change

- Ingestion flow: prescan -> process -> normalize -> reprocess
- AI providers, fallback chain, prompts, extraction quality
- The `ai_usage_events` economics telemetry
- Auth, entitlement, billing, storage
- `document_fields`, `virtual_records`, `virtual_record_fields` — leave in
  place and populated until M4. Nothing is dropped in this brief.

## The correction being made

Live data has **one extraction row and one record per file**. Files are the
grain. They should not be.

**The grain is the business event.** A receipt is one event. A 200-row CSV is
200. And `line_items` — an array present on all 44 existing records — means
even a single receipt carries child events currently buried as a JSON blob.

Records are **hierarchical**: a parent event with optional children.
`parent_record_id` is null for top-level events. Every aggregation index is
partial on `parent_record_id is null` so a receipt and its line items are
never summed together.

---

## 1. `supabase/functions/_shared/field-mapping.ts` — new

One file. Declared data, not scattered conditionals.

**These are the real extracted field names, from the live database. Do not
invent others.**

| Extracted | Freq | Destination |
|---|---|---|
| `document_date` | 44 | `records.occurred_on` |
| `line_items` | 44 (array) | **child records** |
| `is_recurring` | 44 | `records.is_recurring` |
| `currency` | 42 | `records.currency` |
| `total_amount` | 41 | `records.amount` |
| `vendor_name` | 39 | `records.counterparty` |
| `expense_category` | 31 | `records.category` |
| `vendor_normalized` | 5 | `records.counterparty_normalized` |
| `period_start` / `period_end` | 6 | `records.period_start` / `period_end` |
| `gross_income` / `net_income` | 4 | payslip, see below |
| `employer_name` | 4 | `records.counterparty` (payslip) |
| `tax_amount`, `discount_amount` | 9 / 1 | `record_attributes` |
| `jurisdiction`, `classification_rationale`, `merchant_domain`, `merchant_address_country` | few | `record_attributes` |

**`direction` is never extracted — always derive:**
- `expense_category` present, or record_type receipt/invoice -> `outflow`
- `gross_income` / `net_income` present -> `inflow`
- Signed amount on a bank row -> sign decides
- Otherwise -> `neutral`

Payslip: `amount` <- `net_income`; `gross_income` to attributes.

Every field not mapped to a column goes to `record_attributes`. **Nothing is
discarded.**

## 2. `supabase/functions/_shared/derive-records.ts` — new

```
deriveRecords(extraction, file) -> { records[], attributes[] }
```

**Pure function. No database access.** The caller persists.

- **`source_key` is deterministic identity.** `'root'` for a single-event
  document; `'0'`,`'1'`,... for spreadsheet rows; `'0.1'`,`'0.2'` for line
  items beneath row 0; `'root.1'` for line items on a single-event document.
  Unique on `(file_id, source_key)` so re-deriving replaces, never duplicates.
- **Fan out** where the payload contains rows. Each row is a top-level record
  (`parent_record_id` null). Each `line_items` entry becomes a child of its row.
- **Children never carry the parent's total.** A line item's `amount` is its
  own. If absent, leave null — do not copy down.
- `confidence` per record = lowest contributing field confidence.
  `field_confidence` is a per-column map.
- `needs_review` true when: any contributing field below 0.80, or `amount` or
  `occurred_on` missing on a financial record type, or `currency` absent while
  `amount` present.
- **Idempotent.** Deriving the same extraction twice produces identical output.

**Write fixtures first and make them pass before this touches a database:**
a receipt with 5 line items, a 3-row CSV, a 200-row CSV, a payslip, a
contract, an empty payload, a malformed payload. The malformed case returns an
empty result and a reason — never throws into the ingestion path.

**STOP AND REPORT once these fixtures pass. Do not continue to section 4.**

## 3. The user-override overlay — must not be got wrong

User corrections live in `record_revisions` with `change_kind = 'user_edit'`.
They are **an overlay, never an in-place mutation**.

`applyOverrides(records, revisions)` runs **last** in every persistence path.
A record's current value is *the latest derivation with user edits re-applied
on top*.

Without this, re-running extraction silently destroys every correction the
user made. They fix an amount, we reprocess, it reverts. Not optional, not a
later stage.

Set `has_user_edits` true on any record carrying an override.

## 4. Edge functions

**`process-document`, `normalize-document`, `reprocess-documents`** — same AI
calls, same telemetry. Only the tail changes: write an `extractions` row
(`attempt_number`, `provider`, `model`, raw `payload`), then `deriveRecords`,
then persist, then `applyOverrides`.

Keep writing `document_fields` as well. Dual-write until M4.

`normalize-document` also writes `payment_obligations` — leave as-is; the
`record_id` link comes with M2.

**`analyze-spreadsheet` — the important one.** It currently collapses a sheet
into a single summarised object. It must emit the **full row array** in the
extraction payload so `deriveRecords` can fan out. Set `source_row_count`.
A 200-row CSV becoming 200 records is the point of this entire brief.

**`generate-advanced-analytics`, `generate-rd-analytics`,
`generate-context-summary`** — switch reads to `records`. Simpler: typed
columns, real aggregation in Postgres, no EAV pivoting. **Filter
`parent_record_id is null`** in every aggregate. Cap every read.

**`prescan-document`, `diagnose-error`, `fx-backfill`** — unchanged.

Every `[functions.*]` in `config.toml` needs `verify_jwt = false`; deploy with
`--no-verify-jwt`.

## 5. App layer

**New `lib/records.ts`** — single module owning all reads. Paginated,
filtered, aggregated in Postgres. Replaces `lib/virtual-model.ts`, whose
`MAX_ROWS = 40` cap and fetch-all-files-then-`.in()` pattern both fail at the
volumes we sell.

Aggregations return **totals plus a bounded evidence sample**, never a
truncated row set.

Leave reports, dashboard and data model view alone in this brief.

## Verification — report each

1. Receipt with line items -> 1 extraction, 1 parent, N children with
   `source_key` `root.1`...`root.N`
2. 200-row CSV -> 1 extraction, 200 top-level records `source_key` `0`...`199`;
   upload again -> still 200, not 400
3. `select sum(amount) from records where user_id=$1 and parent_record_id is
   null` does not double-count line items
4. Edit a field, re-run reprocess, edit survives, `has_user_edits` true
5. Malformed payload -> empty result plus reason, ingestion does not fail
6. `pnpm build`, `pnpm lint`, `pnpm exec tsc --noEmit` all pass

## Standing rules

- No browser driving, no network probing, no escalating local permissions.
  Unavailable tool -> report and stop.
- Never run `db push`.
- No client-side `supabaseAdmin`.
- Every read bounded.
- Build before push.
- If anything here conflicts with the codebase, stop and say so. Do not
  resolve it yourself.

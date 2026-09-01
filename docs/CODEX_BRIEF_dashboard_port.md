# Codex brief — Phase 3c: port the dashboard off document_fields

The last reporting consumers of `document_fields`. Same method as the report
cutover: **byte-identical output, proven before the old path is removed.**

Scope: `lib/normalized-data-context.ts` (40 lines) and
`lib/dashboard-ai-context.ts` (45 lines). **Do not touch
`app/tools/smart-dashboard/page.tsx`** — it is 3,270 lines and it does not
need to change. Port the queries, keep the row shape identical, and every
consumer is unaffected.

Consumers, for context: the dashboard page (two call sites), the dashboard
chat route, and the MCP profile tool. Three surfaces, two functions.

No migrations.

## The rule

The returned rows must have the **same keys, same types, same values** as
today. If the shape changes, the port has failed regardless of whether the
numbers look right — a 3,270-line consumer will find the one field you
dropped, and it will find it in production.

## Mapping

`document_fields` column → `records` source:

```
file_id                  records.file_id
document_date            records.occurred_on
total_amount             records.amount
currency                 records.currency
expense_category         records.category
vendor_name              attribute 'vendor_name'  (see note)
vendor_normalized        records.counterparty_normalized
merchant_domain          attribute 'merchant_domain'
merchant_address_region  attribute 'merchant_address_region'
is_recurring             records.is_recurring
gross_income             attribute 'gross_income'   (value_numeric)
net_income               attribute 'net_income'     (value_numeric)
line_items               child records (parent_record_id = this record)
files{...}               join files as today
```

**`vendor_name`:** read the attribute, not `records.counterparty`. Every
record now carries `vendor_name` and/or `employer_name` as attributes
recording which field produced the counterparty. `counterparty` alone cannot
tell you which, and inferring from `record_type` is wrong — a payslip whose
name came from `vendor_name` proves it.

**`raw_json`:** the dashboard page does not read it (verified — no reference
in `page.tsx`). Return `null` and note it in a comment. Do not reconstruct it
from `_raw_json`.

**`normalization_status`:** every row from `records` is by definition derived,
so return `"normalized"`. The page's check for `"raw"` at line 153 then never
fires, which is correct — a raw row has no record.

**Filters:** `normalization_status in ('normalized','manual')` becomes
`excluded_at is null`. Always add `parent_record_id is null` — children carry
duplicate amounts and would double every total.

## RLS

`fetchDashboardReadyFields` uses the **client** Supabase (anon key + RLS), not
the admin client. `records` and `record_attributes` both have owner-read
policies for `authenticated`, so this works — but verify it actually returns
rows under a real session rather than assuming. `buildDashboardAIContext` uses
`supabaseAdmin` and is unaffected.

`line_items` needs child records, which means a second query or an embedded
select. Do not fetch children for rows that have none.

## Parity

Extend `scripts/report-parity.ts`, or add `scripts/dashboard-parity.ts`
following the same pattern:

- run both implementations of each function over the same user and range
- join rows on `(file_id, source_key)` — never positionally; two documents
  share the date 2026-03-31 and positional comparison produced 182 phantom
  diffs last time
- order deterministically: `occurred_on`, then `source_key`
- deep-diff, exit non-zero on any difference

Run it against production for the account with 47 files and nine document
types. **Report the diff count before changing any consumer.**

Expect near-zero. If a field differs, report it rather than adjusting until it
matches — four real defects were found that way during the report cutover.

## Do not

- Remove any `document_fields` read. Both paths run until the diff is zero.
- Change the row shape, key names, ordering, or numeric formatting.
- Touch `page.tsx`, the MCP tool definitions, or the chat route.

## Verification

`pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, then the parity output
for both functions.

You cannot verify the rendered dashboard — that needs a signed-in browser.
Say so plainly. Andrew will open it and Claude will check the database.

Do not push until Andrew has seen the diff counts.

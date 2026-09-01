# Codex brief — Phase 3a: the cutover, parity first

Move the reports from `document_fields` to `records`. This phase changes the
**data source only**. It does not change the query strategy, the output, or
the UI.

## The method, and why it is not optional

Every report must produce **byte-identical output** from `records` as it does
today from `document_fields`, on the same data, before the old path is
removed.

That is the whole design. A cutover that "looks right" is how a tax report
quietly changes by $40 and nobody notices for two quarters. We are not
judging the new output on whether it seems plausible; we are diffing it
against the output the business already trusts.

**Change one thing at a time.** Do not also move aggregation into Postgres in
this phase, even though that is the eventual goal and the current code
foolishly sums in the browser. Changing source and strategy together makes a
failed diff impossible to diagnose. Phase 3b does the aggregation.

## Step 1 — build the parity harness first

Before porting anything, write `scripts/report-parity.ts`:

- takes a user id, a date range, an optional folder id, and a report key
- runs the existing `document_fields` implementation and the new `records`
  implementation over the same scope
- deep-diffs the two results and prints every difference with a path
  (`rows[3].total_amount: 132.4 vs 132.40`)
- exits non-zero if there is any difference

Run it against the real production data for user
`avinnilooban@outlook.com`'s account — 47 files, 266 records, nine document
types, dates spanning Dec 2025 to Dec 2026.

The harness is the deliverable of step 1. Report its output before writing a
single line of the port.

## Step 2 — port `lib/report-engine.ts` first

Highest leverage in the codebase. `taxRows()` there feeds **four surfaces**:
the Tax Bundle report, the Business Expense report, the firm export at
`app/api/firm/clients/[userId]/export/route.ts`, and the MCP tools
`smart_storage.report` and `smart_storage.export`. One port, four consumers.

Do not touch `lib/tax-bundle.ts` — the 738 lines of Schedule C maths take rows
as input and must keep working unchanged. If the ported rows are correct, the
maths is correct. If you find yourself editing tax maths to make a diff pass,
**stop and report** — that means the rows are wrong.

## Invariants — get these wrong and the numbers are wrong

**Parent-only for anything summed.** `records` holds parents and line-item
children, both carrying amounts. Every total must filter
`parent_record_id is null`. The all-in sum is 2,070,623.44 against a
parent-only 990,404.15 on the backfilled data — that gap is the whole hazard.

**Exclusions.** `records.excluded_at is null` is the equivalent of
`normalization_status <> 'excluded'`. Claude has added that column. Zero rows
are excluded today, so this will not show up in a diff — apply it anyway,
because it is invisible until it matters and then it is wrong.

**Folder scoping.** Reuse `lib/report-folder-scope-server.ts` exactly as it
is. It walks the tree server-side and validates ownership, never trusting
client-supplied ancestry. Do not reimplement it against `records`.

**Field mapping.** `records` carries typed columns where `document_fields`
carried names:

```
document_date    -> occurred_on        vendor_name    -> counterparty
total_amount     -> amount             expense_category -> category
currency         -> currency           confidence_score -> confidence
period_start/end -> period_start/end   line_items     -> child records
```

Attributes in `record_attributes` hold `gross_income`, `tax_amount`,
`jurisdiction`, `classification_rationale`, `merchant_domain`,
`merchant_address_country`, `quantity`, `discount_amount`.

**A mapping is not documented for everything, and that is deliberate.** Some
fields the reports use — `income_source` is one — may have no home in the
record layer at all. Do not invent one and do not silently drop the field.
Make the diff surface it, then **stop and report what is missing**. A gap
found here is a real finding; a gap papered over here becomes a wrong number
in a client's tax bundle.

For payslips specifically, note that `employer_name` maps to `counterparty`
and `net_income` maps to `amount`, so `gross_income` is the attribute. Verify
that against the diff rather than trusting this paragraph.

## Step 3 — the other five, one at a time

`expense_summary`, `income_summary`, `profit_loss`, `contract_summary`,
`key_terms`. Port one, get its diff to empty, commit, move to the next. Do
not batch them.

`contract_summary` also reads `payment_obligations`, which is unaffected —
leave that half alone.

Leave the Smart Dashboard (`lib/normalized-data-context.ts`) for a later
pass. It is the largest consumer and deserves its own phase.

## Do not

- Remove any `document_fields` read. This phase adds a path; it removes
  nothing. Both run until every diff is empty.
- Change any report's output shape, rounding, ordering, or field names.
- Touch `lib/tax-bundle.ts`, the dashboard, or the MCP tool definitions.
- Write migrations. Claude owns the database.

## Verification

`pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`.

Then, for each report ported, paste the parity harness output. An empty diff
is the pass condition; anything else is a finding to report, not a thing to
adjust until it goes away.

Report which reports reached parity, which did not, and exactly what
differed. Do not push until Andrew has seen the diffs.

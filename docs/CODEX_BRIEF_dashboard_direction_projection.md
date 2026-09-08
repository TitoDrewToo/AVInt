# Codex task — 7 Sep 2026

Four groups. **P0 is a live correctness defect on the flagship dashboard
number.** Evidence for every claim is in `claude/Proof_Run_2026-09-07.md`,
gathered by driving production in the browser and verifying each figure against
Postgres.

**Approval:** Andrew approved this task set on 7 Sep ("lets get all fixed").
P0 and P1 are report math, which `CLAUDE.md` marks material — that approval is
the gate, and it covers these four groups only. Anything beyond them comes back
for approval first.

**Do not demo, film, or submit anything showing the Smart Dashboard until P0
lands.**

---

## P0 · Dashboard reports income as expense — root-caused, two-line fix

### The defect

Smart Dashboard, Expenses KPI, gmail account, all-time, primary PHP:

```
TOTAL EXPENSES (PHP)   PHP 1,076,114.431      <- displayed
correct                PHP   364,831.831
overstated by          PHP   711,282.600      (2.95x)
```

Verified in SQL against the live database:

```
1,669 + 6,433.24 x 56.451             =   364,831.831   correct
1,669 + (6,433.24 + 12,600) x 56.451  = 1,076,114.431   displayed  <- exact match
```

The KPI is summing **inflow and outflow together** and labelling the result
"Total Expenses". Corroborating tell: the Income KPI beside it reads *"No data
in selected period"* while $12,600 of income exists. The same money is invisible
as income and counted as expense.

### Root cause — a dropped column, not bad arithmetic

`lib/normalized-data-context.ts:30`, `fetchDashboardReadyFields`:

```ts
.select("id, file_id, source_key, occurred_on, amount, currency, category, \
counterparty_normalized, is_recurring, confidence, parent_record_id, \
excluded_at, files!inner(document_type, filename, user_id)")
```

**`direction` is not selected.** And the projected row object it returns
(same file, ~line 74) has no `direction` key and no `income_source` key — it
maps only `gross_income` and `net_income` out of `record_attributes`.

`lib/document-classification.ts:69` `classifyRow` has two branches that would
classify these rows correctly, and the projection starves both:

```ts
const direction = stringValue(row.direction)
if (direction === "inflow")  return "income"      // line 73 - row.direction is undefined
if (direction === "outflow") return "expense"
...
if (stringValue(row.income_source)) return "income"  // line 76 - also never projected
...
if (fileType === "csv_export") {
  if (row.gross_income != null || row.net_income != null) return "income"
  if (row.total_amount != null) return "expense"     // <- every income row lands here
}
```

The three income records confirm it. Each has `records.direction = 'inflow'`
**and** `record_attributes.income_source = 'business'`, and **no**
`gross_income` / `net_income` attribute:

```
id                                    direction  amount    currency  document_type
ad1b7351-2f0f-4489-802d-36335dc0bb02  inflow     4200.00   USD       csv_export
05807371-8390-4fa2-ba88-6b28208a0408  inflow     4200.00   USD       csv_export
6c426142-3e18-4717-8d20-f55b8476821b  inflow     4200.00   USD       csv_export
```

Two correct signals available, both discarded in projection, so the heuristic
fallback decides — and it decides wrong.

### The fix

1. Add `direction` to the `.select()` in `fetchDashboardReadyFields`.
2. Map `direction: record.direction` and
   `income_source: fields.get("income_source")?.value ?? null` into the returned
   row object.

That is the whole fix. `classifyRow` already prefers `direction` over every
heuristic, so both KPIs correct themselves and no aggregation logic changes.

**Do not** patch this in `computeBucket` or `buildCurrencyModel`. Those are
correct — they separate income and expense per currency bucket properly. The
merge path (`app/tools/smart-dashboard/page.tsx:2228`) is also correct: it
converts per row and rebuilds through `buildCurrencyModel`. The single point of
failure is the projection.

### Audit the same projection for other dropped columns

`direction` was not the only casualty. Check every consumer of
`fetchDashboardReadyFields` against `classifyRow`'s and `isAggregateRow`'s full
input surface, and confirm nothing else that drives a classification or a total
is being silently defaulted. **A column that is absent behaves as a column that
is null, and null takes the fallback branch.** That is the pattern to hunt.

### Closure criteria

- Expenses KPI shows **PHP 364,831.83** for the gmail account, all-time, primary PHP.
- Income KPI shows **$12,600** (or its PHP conversion) rather than "No data".
- Net position and savings rate recompute accordingly — check both; they derive
  from these two totals in `computeBucket` (`lib/smart-dashboard.ts:250-253`).
- A regression test asserting `classifyRow` receives `direction` for a row
  projected by `fetchDashboardReadyFields`. Test the projection, not just
  `classifyRow` in isolation — `classifyRow` was never broken.

Verification query:

```sql
with r as (
  select direction, currency, sum(amount) amt
  from public.records
  where user_id='7f6457ff-b7a0-42f5-a0ef-f5fc4eb0e720'
    and excluded_at is null and amount is not null
  group by direction, currency
), fx as (
  select rate from public.fx_rates
  where base_currency='USD' and target_currency='PHP'
  order by rate_date desc limit 1
)
select round((select amt from r where direction='outflow' and currency='PHP')
           + (select amt from r where direction='outflow' and currency='USD')
           * (select rate from fx), 3) as expected_total_expenses_php;
-- 364831.831
```

---

## P1 · FX conversion uses a 14-month-old rate, silently

The rate applied is `56.451`, `rate_date` **2025-06-30**, fetched 2026-05-07.
Today is 2026-09-07. `amount_base` and `fx_rate` are **NULL on every record** —
conversion happens at render time from `fx_rates` and is never persisted or
dated per row.

`lib/fx.ts:29` `convertAmount` throws on a missing rate, and
`getRequiredRateTuples` keys by the row's `document_date` — so the design
intends per-transaction-date rates. In practice the table's newest USD->PHP row
is over a year old, so every conversion silently resolves to stale data.

This breaks rule 1 of the four standing rules: *a figure may only be shown over
a window its own data covers.* A converted total carries an implicit as-of date
that is neither current nor disclosed.

**Required:**

- Surface the rate date wherever a converted figure is shown. A merged-currency
  KPI must say what rate and what date produced it.
- Decide and implement a staleness policy. Suppression beats a wrong number:
  past a threshold, show the split-currency view rather than a converted total.
  **Do not silently extrapolate.**
- `fx-backfill` last ran 2026-05-07. Determine whether it is scheduled or was
  manual, and make refresh routine.

Persisting `amount_base` / `fx_rate` / `fx_rate_date` per record is the more
durable fix — it makes a historical figure reproducible instead of
recomputed-at-render. **Schema change: bring the plan back for approval before
writing a migration.**

---

## P2 · Report authoring drops temporal constraints

Prompt: *"Total expenses by vendor for 2026, highest first"*. Saved:

```
slug     total-expenses-by-vendor-for-2026-highest-first
title    "Total expenses by vendor for 2026, highest first"
period   {"kind": "all"}          <- should be 2026
```

The hand-built harness carries
`{"kind":"fixed","from":"2026-08-01","to":"2026-08-31"}`, so the schema supports
it — the author step is not producing it.

A report **titled** for a period that computes over all time is a label
overstating the underlying math, which `CLAUDE.md` prohibits explicitly.

**Two fixes, complementary — do both:**

1. `app/api/report-definitions/author/route.ts` — teach the author step to
   extract a period and emit `period.kind: "fixed"`.
2. **Validate at the store boundary:** refuse to save a definition whose title
   names a period the definition does not scope. Prompt engineering fixes the
   prompts we thought of; validation fails closed for the ones we did not.

Also verify whether "highest first" survived into block ordering — read the
stored `blocks` for that slug. Unknown, not assumed.

Delete the test row when done:
`slug = total-expenses-by-vendor-for-2026-highest-first`, gmail account.

---

## P3 · Carry-over

**Done, not for Codex:** tool annotations (all 15, `2dcdc8f`) and the auth-path
hardening (`272e6a8`) are complete and passing. Both are unpushed — the sandbox
git proxy declines credentials for `TitoDrewToo/AVInt`. Patches were delivered
to Andrew; apply them before branching from `main`.

Still open from `CODEX_TASK_2026-09-06b`:

- **Commit the three migrations** plus `test/function_grant_contract.sql` and
  the CLAUDE.md "Function Grants" section. Filenames match recorded versions;
  after commit, drift is zero.
- **Grep `subscriptions_email_unique` / `subscriptions_email_key`.** Both are
  UNIQUE on the same column. If no upsert names either via
  `ON CONFLICT ON CONSTRAINT`, drop `subscriptions_email_unique`.
- **Superseded security note:** the entire external Cloud Run integration was
  later abandoned, not only its optional LLM augmentation. The approved
  prescan-native replacement is `docs/smart-security-architecture.md`.
- **Revision history references `category`**, a `records` column the panel does
  not display as a field. Surface it or label the entry's origin.
- **Cold load ~7s** measured on Smart Storage this session (0 -> 11 documents),
  consistent with the ~10s recorded on 6 Sep. Find where the time goes before
  anything is filmed.
- **One corrupted attribute row**: `record_attributes` with
  `field_key = 'raw_json'`, `is_custom = true`, value `"[object Object]"`.
  Writer defect fixed 5 Sep; row never cleaned. Confirm the owning account, then
  one-row delete.

---

## Sequence

```
P0   dashboard projection - direction + income_source     <- blocks the demo
P1   FX staleness disclosure + policy   (schema part: approval first)
P2   report author period + store-boundary validation
P3   carry-over
```

P0 first and alone if necessary. Until it lands, the dashboard cannot be shown
to anyone.

## Standing note

The projection bug survived every prior review because reviews read code and
compared it to intent. It was caught in ten minutes by rendering a number and
summing the same rows in SQL. **For anything that displays a figure, verify
against the database, not against the code's apparent meaning.**

---

## Addendum — 7 Sep, post-P0 audit (Claude)

**P0 diff verified.** `lib/normalized-data-context.ts` only; `direction` added to
the `records` select; `direction` and `income_source` mapped into the projected
row. `npx tsc --noEmit` re-run independently: exit 0. No `neutral`-direction
rows exist in any account, so nothing silently drops out of both buckets.

**Regression test added:** `scripts/test-dashboard-projection-classification.ts`.
Proven to catch the defect — run against the pre-fix source it fails with
*"fetchDashboardReadyFields must select `direction` from records"*; against the
fixed source all 5 assertions pass. It tests the seam between the projection and
the classifier, not `classifyRow` alone, because `classifyRow` was never broken.

Note: it cannot run inside the Cowork Linux VM — `node_modules` holds
`@esbuild/darwin-arm64`, so `tsx` fails there. Run it natively on the Mac.

### Two more fields the projection drops. Both latent, neither urgent.

The brief asked for an audit of the same pattern. Two found. **Neither is
currently producing a wrong number** — verified against the database, no
matching rows exist today — so these are hardening, not P0.

**1. `records.document_type` is not selected.** `rowDocumentType` reads
`row.document_type` and then `raw_json`, and the projection supplies neither
(`raw_json` is deliberately `null`). So the record's own document type is
invisible and classification falls back to `rowFileDocumentType`, i.e. the
**file's** type. That is the file-grain-on-row-grain error
`CODEX_BRIEF_income_direction.md` called out and required removing from
`report-sections.ts` — it survives here. A CSV whose rows carry a per-row
`document_type` would be classified by the container instead of the row.

Verified today: no record's `document_type` differs from its file's, so no live
misclassification. It becomes real the moment mixed-type rows land in one file.

**2. `isAggregateRow` and `isCreditOrRefundRow` are permanently false on this
path.** Both read `rowLabelText`, which uses `row.vendor_name` plus several
`raw_json.gemini_raw` fields. The projection maps `vendor_normalized`, not
`vendor_name`, and sets `raw_json: null`. So `rowLabelText` always returns an
empty string, and:

- the aggregate-row guard — the very first line of `classifyRow` — never fires,
  so a subtotal/total row would be counted as a real transaction;
- the credit/refund → income rule never fires, so a refund would count as an
  expense.

Ingestion filters subtotal/total markers upstream (see CLAUDE.md, spreadsheet
extraction step 4), which is why nothing is wrong today. But the dashboard's own
guard is inert, and a refund arriving through any path that does not pre-filter
would be booked as spend.

**Recommendation:** map `document_type: record.document_type` and
`vendor_name: record.counterparty` (or whichever field feeds the label) into the
projection. Decide deliberately whether `raw_json` stays null — the comment says
the dashboard must never consume raw provider output, which is a good rule, so
the fix is to project the *derived* label rather than to relax that rule.

### The pattern worth naming

Three fields now, all the same shape: a shared classifier was taught to read a
signal, and one of its data sources was never updated. The type does not catch
it — `ClassifiableDocumentRow` declares every field optional, which is why
`tsc` passed before and after the defect existed.

**A projection feeding a shared classifier is part of that classifier's
contract.** When a classifier learns a new input, every producer is in scope for
the change, not only the one whose output was tested.

### Still open on P0

Closure criteria are unverified: the corrected KPI values need the app running.
Expected on the reference account (avinnilooban@gmail.com, all-time, primary
PHP):

```
Expenses KPI   PHP   364,831.83     (was 1,076,114.43)
Income KPI     PHP   711,282.60     (was "No data in selected period")
```

The income figure equals the previous overstatement exactly — the money returns
to where it was taken from. Check net position and savings rate at the same
time; both derive from these two totals.

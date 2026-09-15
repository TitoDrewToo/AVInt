# Analyst Reconciliation Lab

This lab uses synthetic agency-performance CSVs only. It mirrors the first Smart Storage reconciliation workflow and is safe to use for interview preparation.

Fixture directory:

`/Users/avin/Documents/Codex/2026-09-15/referenced-chatgpt-conversation-this-is-an/docs/fixtures/agency-performance-persistence-v1/`

## Exercise 1 — profile both sources

Before joining, answer:

- What is the row count in each file?
- Which field is the stable transaction identifier?
- Which fields are numeric, categorical, date/period, and nullable?
- Are blank revenue and zero revenue the same thing?
- Which rows could be duplicates?

SQL pattern:

```sql
select
  count(*) as raw_rows,
  count(distinct transaction_id) as distinct_transactions,
  count(*) - count(distinct transaction_id) as duplicate_rows,
  count(*) filter (where gross_revenue is null) as missing_revenue,
  count(*) filter (where gross_revenue = 0) as genuine_zero_revenue
from january_source;
```

## Exercise 2 — two-way reconciliation

Use a full outer join on the stable key. Classify every row as matched, missing from the left, or missing from the right.

```sql
select
  coalesce(a.transaction_id, b.transaction_id) as transaction_id,
  case
    when a.transaction_id is null then 'missing_from_a'
    when b.transaction_id is null then 'missing_from_b'
    when a.gross_revenue is distinct from b.gross_revenue then 'conflict'
    else 'matched'
  end as finding,
  a.gross_revenue as source_a_revenue,
  b.gross_revenue as source_b_revenue
from source_a a
full outer join source_b b using (transaction_id)
where a.transaction_id is null
   or b.transaction_id is null
   or a.gross_revenue is distinct from b.gross_revenue;
```

## Exercise 3 — data-quality checks

Write queries for:

1. duplicate transaction IDs;
2. missing required customer IDs;
3. invalid outcome values;
4. negative revenue that is not a refund;
5. CSAT outside 1–5;
6. totals by period and outcome.

For each query, state the evidence row, severity, and remediation owner.

## Exercise 4 — investigation narrative

Write a five-sentence summary using:

- What happened;
- So what / business impact;
- likely cause, only if supported;
- evidence rows;
- recommended next action and uncertainty.

Do not call a missing value zero, and do not infer a cause from correlation alone.

## Exercise 5 — interview explanation

Explain the workflow in this order:

1. establish the grain and key;
2. profile both inputs;
3. reconcile counts and totals;
4. isolate exception rows;
5. validate against business rules;
6. document root cause and remediation;
7. retest after correction.

Answer key: `answer-key.md` in the same fixture directory.

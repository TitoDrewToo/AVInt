# Codex brief — Phase 2: the dataset layer

A spreadsheet is a table. Store it as one.

Claude has applied the schema (`datasets`, `dataset_columns`, `dataset_rows`)
— **write no migrations.** This brief is the code.

## Why this exists

Today, any spreadsheet column that is not a recognised accounting field
collapses into one untyped `_custom_fields` JSON blob per row. A traffic
export (`day, views, visitors, path`) ingests without error and produces
records whose every typed column is null. There is no per-column key, type,
or confidence, and no query can reach the data.

## The one rule that governs this work

**Types are inferred deterministically from the values. A model never sets a
type.**

A column is a number because its values parse as numbers — not because
"Amount" sounded like money. The current header mapper sends headers to
Gemini and could map `views` to `total_amount`, silently turning a pageview
count into currency. Unlike a wrong row count, that error produces a
plausible-looking number and would never be noticed.

A model may *suggest* a **role** (`measure` / `dimension` / `time`), because
that is a semantic judgement the values cannot settle. But a suggestion that
contradicts the inferred type is discarded: a measure must be a `number`
column, a time must be a `date` column.

---

## 1. Every spreadsheet produces a dataset

In `process-document`, when `isSpreadsheetInput(...)` is true, write a
dataset for **every** sheet — one `datasets` row per sheet, keyed
`(file_id, sheet_name)`.

Do **not** make this a routing decision. A spreadsheet that also contains
recognisable accounting fields continues to produce records exactly as it
does today, *in addition* to its dataset. The dataset is what the file
contains; the records are the business events we recognised inside it. There
is no branch that can be chosen wrongly, and the data-model view can always
show a file's actual table.

Set `datasets.row_count` and `column_count` from what you actually wrote, not
from what you expected to write.

## 2. Column keys and labels

`label` is the header cell verbatim. `key` is a normalised snake_case
identifier derived from it.

Handle these, and say in your report how you did:

- duplicate headers after normalisation → suffix `_2`, `_3`
- empty header cells → `column_<position>`
- headers that normalise to an empty string → same fallback

`position` is the zero-based column index in the sheet.

## 3. Deterministic type inference

Examine every non-null cell in the column (or a capped sample of at least
1000 rows — say which you chose).

- **number** — ≥95% of non-null cells parse as numeric after trimming
  whitespace, thousands separators, a single leading currency symbol, and
  parenthesised negatives (`(1,234.50)` → `-1234.50`).
- **boolean** — 100% of non-null cells are in
  {`true`,`false`,`yes`,`no`,`y`,`n`}. Do **not** treat `0`/`1` as boolean;
  number wins.
- **date** — ≥95% parse as a date, subject to the ambiguity rule below.
- **text** — everything else. This is the safe fallback, not a failure.

Record `type_confidence` as the share of non-null cells that parsed as the
chosen type. Set `null_count` and `distinct_count`. Put the first five
distinct non-null values in `sample_values`.

### The date ambiguity rule — do not guess

`03/04/2026` is 3 April or 4 March depending on locale, and guessing wrong
silently shifts a whole report by weeks.

- ISO (`YYYY-MM-DD`) → unambiguous, accept.
- Slash or dot formats → scan the whole column. If **any** value has a first
  component greater than 12, the order is proven and applies to the column.
- If the order cannot be proven from the data, type the column as **text**,
  set `needs_review = true` on the column, and set `review_reason` to
  something a person can act on, e.g. `"Date order is ambiguous (03/04/2026
  could be 3 Apr or 4 Mar). No value in this column proves the order."`

Set `datasets.needs_review = true` when any of its columns needs review.

## 4. Rows: coerce, but never discard

For each row write one `dataset_rows` row:

- `data` — values coerced to each column's inferred type: JSON numbers for
  `number`, `YYYY-MM-DD` strings for `date`, JSON booleans for `boolean`,
  strings for `text`. A cell that fails to coerce is `null` here.
- `data_raw` — the original cell text for every column, always.

`row_index` is the zero-based row position beneath the header.

Do **not** apply `isGarbageRow` filtering to dataset rows. That heuristic
drops blank, subtotal and refund-labelled rows, which is defensible when
deriving business events and wrong when representing a table: the user's file
has 200 rows and their dataset must have 200 rows. Keep the filter on the
record path only.

## 5. Role suggestion is optional and constrained

If you use the existing model call to suggest roles, apply it **after** type
inference and reject any suggestion that contradicts the inferred type. If
the model is unavailable, leave `role` null — a null role is a fine state and
must not block ingestion.

## 6. Idempotency

Re-processing a file must replace its datasets, not duplicate them. Delete
the file's existing `datasets` rows (rows and columns cascade) before writing
the new ones, inside the same code path that rewrites records.

If a sheet yields zero rows, still create the dataset with its columns and
`row_count = 0`. An empty sheet is a fact about the file, not an error.

---

## Verification

`pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, Deno type-check, deploy
with `--no-verify-jwt`.

Add fixture cases to `scripts/` covering, at minimum:

- a numeric column containing `1,234.50`, `$99`, `(45.00)` → `number`,
  values `1234.5`, `99`, `-45`
- a column of `2026-01-08` style values → `date`
- a column of `03/04/2026` values where no first component exceeds 12 →
  `text`, `needs_review = true`, with a reason
- a column of `03/14/2026` values → `date`, order proven as MM/DD
- a mixed column that is 96% numeric → `number`, `type_confidence ≈ 0.96`
- duplicate headers → distinct keys
- a blank row in the middle → still present in `dataset_rows`

Report the fixture results.

**You cannot run the live ingestion test** — it needs a signed-in browser
upload. Andrew will upload a fixture and Claude will check the database. Do
not report a live result as observed.

Do not push until Andrew has seen your report.

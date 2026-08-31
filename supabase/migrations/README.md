# Migrations

## The rule

One migration, applied once, recorded once, with a repo file whose name
matches the recorded version. No exceptions — that discipline is the whole
reason this directory is trustworthy again.

Never run `supabase db push` against this project.

## How to apply a migration

Claude applies migrations through the Supabase MCP `apply_migration` tool,
which executes the SQL and records it in
`supabase_migrations.schema_migrations` under a generated timestamp version.
**The repo file must then be named `<that version>_<that name>.sql`.**

Getting this wrong is what produced the drift described below: the database
recorded `20260831093252_document_fields_source_key` while the repo carried a
file called `20260905_document_fields_source_key.sql`. Same migration, two
identities, and neither one told you about the other.

To check the two agree:

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

That list and `ls supabase/migrations/` should match from the baseline
forward.

## The baseline

`20260831120000_baseline_schema.sql` is the public schema as it existed in
production on 31 Aug 2026, taken with `pg_dump --schema-only` and verified
against the live catalog: 43 tables, 27 functions, 55 RLS policies, 0 enums.

It exists because the history before it had drifted past repair — 61 files
across 34 version prefixes, 8 of them colliding so the CLI silently skipped
all but the first file of each, 24 versions recorded, and several tables
(notably `public.folders`) with no migration file anywhere. The repo could not
rebuild production.

The alternative was to rename the colliding files and record the missing
versions. That would have produced a tidy history that still could not rebuild
production, which is worse than an honest baseline: the next person would have
believed it.

The 61 historical files are preserved unmodified in
`supabase/_migrations_archive/`. They are deliberately outside this directory
so the CLI never sees them. Read them for history; do not replay them.

`supabase_migrations.schema_migrations` still holds the 24 pre-baseline rows,
including the full SQL of each in its `statements` column. Those rows are the
authoritative record of what was applied before the baseline and should not be
deleted — for twelve of them, that column is the only surviving copy.

## What the baseline does NOT capture

`pg_dump --schema=public` covers tables, columns, constraints, indexes,
functions, triggers and RLS policies. Rebuilding a working project from
scratch also needs:

- **Extensions.** Prepended to the baseline: `uuid-ossp`, `pgcrypto`,
  `pg_net`, `pg_cron`. Supabase provisions `plpgsql`, `pg_stat_statements`
  and `supabase_vault` itself.
- **pg_cron schedules.** Three jobs, defined in the archived migrations:
  `sweep-stuck-jobs` (*/5), `reprocess-stuck-normalizations` (*/10),
  `rate-limits-cleanup` (*/15).
- **Vault secrets.** `service_role_key` and `supabase_url`, read by the
  `reprocess-stuck-normalizations` cron. These are secrets and must never
  enter this repo. The service-role key must be the `sb_secret_…` format,
  never a legacy `eyJ…` JWT — the cron fails silently otherwise.
- **Storage buckets and their policies.** The `documents` bucket lives in the
  `storage` schema.

Until those four are scripted, **a rebuild from this repo alone is unverified.**
Say so rather than assuming otherwise.

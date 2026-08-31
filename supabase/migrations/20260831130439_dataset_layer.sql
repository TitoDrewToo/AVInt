-- Dataset layer — a spreadsheet is a table, not a pile of business events.
--
-- WHY
-- Today any spreadsheet column that is not a recognised accounting field
-- collapses into a single untyped `_custom_fields` JSON blob per row: no
-- per-column key, no type, no confidence. A website traffic export
-- (day, views, visitors, path) ingests without error and produces records
-- whose every typed column is null. Forcing tabular data through the
-- business-event grain recreates exactly the EAV problem the record layer
-- was built to remove.
--
-- THE SHAPE
-- The header row IS the schema. Column types are inferred deterministically
-- at ingest — a column is a number because its values parse as numbers, not
-- because a model thought the header looked like money.
--
-- RELATIONSHIP TO `records`
-- Every spreadsheet produces a dataset. A spreadsheet that ALSO contains
-- recognisable accounting fields additionally produces records, as today.
-- The two are not alternatives and there is no routing decision to get
-- wrong: the dataset is what the file contains, the records are the business
-- events we recognised inside it.
--
-- NOTHING IS DISCARDED
-- `data` holds values coerced to the column's inferred type. `data_raw`
-- holds the original cell text, always. A cell that fails coercion is null
-- in `data` and still present in `data_raw`.

create table if not exists public.datasets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  file_id uuid not null references public.files(id) on delete cascade,
  name text not null,
  sheet_name text,
  row_count integer not null default 0,
  column_count integer not null default 0,
  needs_review boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (file_id, sheet_name)
);

comment on table public.datasets is
  'One tabular sheet ingested from a spreadsheet. The header row defines the schema.';

create table if not exists public.dataset_columns (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  user_id uuid not null,
  key text not null,
  label text not null,
  position integer not null,
  data_type text not null check (data_type in ('number','date','text','boolean')),
  role text check (role in ('measure','dimension','time')),
  null_count integer not null default 0,
  distinct_count integer,
  type_confidence numeric(5,4),
  sample_values jsonb,
  needs_review boolean not null default false,
  review_reason text,
  unique (dataset_id, key)
);

comment on column public.dataset_columns.data_type is
  'Inferred deterministically from the values. Never set by a model.';
comment on column public.dataset_columns.role is
  'measure | dimension | time. May be SUGGESTED by a model, but a measure must
   be a number column and a time must be a date column — a suggestion that
   contradicts the inferred type is discarded.';
comment on column public.dataset_columns.type_confidence is
  'Share of non-null cells that parsed as data_type. Below 1.0 means the
   column has exceptions and the reader should be told.';

create table if not exists public.dataset_rows (
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  row_index integer not null,
  user_id uuid not null,
  data jsonb not null,
  data_raw jsonb not null,
  primary key (dataset_id, row_index)
);

comment on column public.dataset_rows.data is
  'Values coerced to each column''s inferred type. A cell that failed to
   coerce is null here and preserved in data_raw.';

create index if not exists datasets_user_idx        on public.datasets (user_id, created_at desc);
create index if not exists datasets_file_idx        on public.datasets (file_id);
create index if not exists dataset_columns_ds_idx   on public.dataset_columns (dataset_id, position);
create index if not exists dataset_columns_user_idx on public.dataset_columns (user_id);
create index if not exists dataset_rows_user_idx    on public.dataset_rows (user_id);
create index if not exists dataset_rows_data_gin    on public.dataset_rows using gin (data jsonb_path_ops);

alter table public.datasets        enable row level security;
alter table public.dataset_columns enable row level security;
alter table public.dataset_rows    enable row level security;

-- Owner-read only, matching public.records. All writes go through the
-- service role in the ingestion pipeline; nothing is writable by a client.
create policy p_datasets_owner_read on public.datasets
  for select to authenticated using (user_id = auth.uid());
create policy p_dataset_columns_owner_read on public.dataset_columns
  for select to authenticated using (user_id = auth.uid());
create policy p_dataset_rows_owner_read on public.dataset_rows
  for select to authenticated using (user_id = auth.uid());

revoke all on public.datasets, public.dataset_columns, public.dataset_rows
  from anon;
grant select on public.datasets, public.dataset_columns, public.dataset_rows
  to authenticated;
grant all on public.datasets, public.dataset_columns, public.dataset_rows
  to service_role;

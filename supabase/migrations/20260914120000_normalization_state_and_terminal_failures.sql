-- Persist row-level normalization state for the set-based spreadsheet path
-- and distinguish terminal processing failure from an active upload.
alter table public.dataset_rows
  add column if not exists normalization_status text not null default 'raw',
  add column if not exists normalization_version integer,
  add column if not exists normalized_at timestamptz,
  add column if not exists normalization_error text;

alter table public.files
  drop constraint if exists files_upload_status_check;

alter table public.files
  add constraint files_upload_status_check
  check (upload_status in (
    'uploaded', 'pending_scan', 'scanning', 'approved', 'processing',
    'normalized', 'done', 'quarantined', 'rejected', 'scan_failed', 'failed'
  ));

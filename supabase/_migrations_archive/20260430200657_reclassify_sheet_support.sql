alter table public.files
  add column if not exists analysis_json jsonb,
  add column if not exists analyzed_at timestamptz,
  add column if not exists source_rows_json jsonb;

alter table public.document_fields
  drop constraint if exists chk_normalization_status;

alter table public.document_fields
  add constraint chk_normalization_status
  check (normalization_status in ('raw', 'normalized', 'failed', 'manual', 'excluded'));

do $$
begin
  alter publication supabase_realtime add table files;
exception
  when duplicate_object then null;
end $$;

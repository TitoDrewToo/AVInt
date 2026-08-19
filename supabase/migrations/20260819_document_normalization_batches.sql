-- Track one extraction run as a normalization batch and settle its file/job
-- state atomically after the final row reaches a terminal state.

alter table public.files
  add column if not exists normalization_batch_id uuid;

alter table public.document_fields
  add column if not exists normalization_batch_id uuid;

create index if not exists files_normalization_batch_idx
  on public.files (normalization_batch_id)
  where normalization_batch_id is not null;

create index if not exists document_fields_normalization_batch_idx
  on public.document_fields (file_id, normalization_batch_id, normalization_status);

create or replace function public.avint_settle_document_normalization(
  p_file_id uuid,
  p_batch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw_count integer;
  v_failed_count integer;
  v_total_count integer;
begin
  -- The row lock serializes concurrent normalizer completions for the same
  -- file, so status cannot advance based on a stale row count.
  perform 1
    from public.files
   where id = p_file_id
     and normalization_batch_id is not distinct from p_batch_id
   for update;

  if not found then
    return jsonb_build_object('settled', false, 'reason', 'file_or_batch_not_found');
  end if;

  select
    count(*) filter (where normalization_status = 'raw'),
    count(*) filter (where normalization_status = 'failed'),
    count(*)
    into v_raw_count, v_failed_count, v_total_count
    from public.document_fields
   where file_id = p_file_id
     and normalization_batch_id is not distinct from p_batch_id;

  if v_raw_count > 0 then
    return jsonb_build_object(
      'settled', false,
      'raw_count', v_raw_count,
      'failed_count', v_failed_count,
      'total_count', v_total_count
    );
  end if;

  update public.files
     set upload_status = 'normalized'
   where id = p_file_id
     and normalization_batch_id is not distinct from p_batch_id
     and upload_status in ('processing', 'done');

  update public.processing_jobs
     set status = 'completed', completed_at = now()
   where file_id = p_file_id
     and status in ('uploaded', 'processing');

  return jsonb_build_object(
    'settled', true,
    'raw_count', v_raw_count,
    'failed_count', v_failed_count,
    'total_count', v_total_count
  );
end;
$$;

revoke all on function public.avint_settle_document_normalization(uuid, uuid) from public;
grant execute on function public.avint_settle_document_normalization(uuid, uuid) to service_role;

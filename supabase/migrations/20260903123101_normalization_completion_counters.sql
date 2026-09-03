-- Restore the normalization work queue in the records model.
--
-- Until M4 phase 3b-i, pipeline completion was recorded as the count of
-- document_fields rows in normalization_status = 'raw'. Edge ingestion no
-- longer writes that table, so avint_settle_document_normalization counted
-- zero outstanding rows for every file and marked it 'normalized' on the
-- first call. Completion is now an explicit recorded fact.

alter table public.files
  add column if not exists normalization_expected integer,
  add column if not exists normalization_settled  integer not null default 0;

comment on column public.files.normalization_expected is
  'Rows queued for normalization by process-document. NULL means never queued.';
comment on column public.files.normalization_settled is
  'Rows that have reached a terminal normalization state. Settled when >= normalization_expected.';

-- Existing files predate the counters and their pipelines have finished.
update public.files
   set normalization_expected = coalesce(normalization_expected, 0)
 where normalization_expected is null;

create or replace function public.avint_settle_document_normalization(
  p_file_id        uuid,
  p_batch_id       uuid    default null,
  p_completed_rows integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_expected integer;
  v_settled  integer;
begin
  -- Serialize concurrent normalizer completions for the same file so the
  -- counter cannot advance on a stale read.
  perform 1
    from public.files
   where id = p_file_id
     and normalization_batch_id is not distinct from p_batch_id
   for update;

  if not found then
    return jsonb_build_object('settled', false, 'reason', 'file_or_batch_not_found');
  end if;

  if p_completed_rows <> 0 then
    update public.files
       set normalization_settled = greatest(normalization_settled + p_completed_rows, 0)
     where id = p_file_id
       and normalization_batch_id is not distinct from p_batch_id;
  end if;

  select normalization_expected, normalization_settled
    into v_expected, v_settled
    from public.files
   where id = p_file_id;

  if v_expected is null then
    return jsonb_build_object(
      'settled', false, 'reason', 'expected_not_recorded',
      'expected', v_expected, 'settled_rows', v_settled
    );
  end if;

  if v_settled < v_expected then
    return jsonb_build_object(
      'settled', false, 'expected', v_expected, 'settled_rows', v_settled
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
    'settled', true, 'expected', v_expected, 'settled_rows', v_settled
  );
end;
$function$;

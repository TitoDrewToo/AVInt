-- Applied to production 2026-09-06 via Supabase MCP by Claude.
-- This file exists so `supabase db reset` reproduces the production contract.
-- It supersedes the definition in 20260903123101_normalization_completion_counters.sql.
--
-- The 3 Sep gate refused only when normalization_expected IS NULL, but nothing writes
-- NULL: 51 of 52 files carried 0. With expected=0 and settled=0 the test
-- `settled < expected` is false, so the function fell through and marked the file
-- normalized on the first call. The gate was still vacuous and 'expected_not_recorded'
-- was unreachable code.
--
-- This version refuses the states that actually occur. A file settles only once the
-- writer has declared how many rows it intends to produce and that many have landed.
--
-- Paired with process-document recording normalization_expected before the first
-- persistDerived write, and normalize-document handling the refusal reasons
-- (branch fix/smart-storage-data-integrity, commits 17519c6 and 231a691).

create or replace function public.avint_settle_document_normalization(
  p_file_id uuid,
  p_batch_id uuid default null,
  p_completed_rows integer default 0
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_expected integer;
  v_settled  integer;
  v_batch    uuid;
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

  select normalization_batch_id, normalization_expected, normalization_settled
    into v_batch, v_expected, v_settled
    from public.files
   where id = p_file_id;

  -- A file with no recorded batch predates batch accounting. It must not settle.
  if v_batch is null then
    return jsonb_build_object(
      'settled', false, 'reason', 'batch_not_recorded',
      'expected', v_expected, 'settled_rows', v_settled
    );
  end if;

  if v_expected is null then
    return jsonb_build_object(
      'settled', false, 'reason', 'expected_not_recorded',
      'expected', v_expected, 'settled_rows', v_settled
    );
  end if;

  -- Zero is not a completion target. It means the writer never declared one.
  if v_expected <= 0 then
    return jsonb_build_object(
      'settled', false, 'reason', 'expected_not_positive',
      'expected', v_expected, 'settled_rows', v_settled
    );
  end if;

  if v_settled < v_expected then
    return jsonb_build_object(
      'settled', false, 'reason', 'incomplete',
      'expected', v_expected, 'settled_rows', v_settled
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

revoke all on function public.avint_settle_document_normalization(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.avint_settle_document_normalization(uuid, uuid, integer) to service_role;

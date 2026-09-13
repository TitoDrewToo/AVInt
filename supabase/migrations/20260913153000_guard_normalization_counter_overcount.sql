-- Never allow a normalization completion counter to exceed its declared
-- obligation. An overcount must be visible as a contract failure, not treated
-- as successful completion.
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
  v_settled integer;
  v_batch uuid;
begin
  select normalization_batch_id, normalization_expected, normalization_settled
    into v_batch, v_expected, v_settled
    from public.files
   where id = p_file_id
     and normalization_batch_id is not distinct from p_batch_id
   for update;
  if not found then
    return jsonb_build_object('settled', false, 'reason', 'file_or_batch_not_found');
  end if;
  if v_batch is null then
    return jsonb_build_object('settled', false, 'reason', 'batch_not_recorded', 'expected', v_expected, 'settled_rows', v_settled);
  end if;
  if v_expected is null or v_expected <= 0 then
    return jsonb_build_object('settled', false, 'reason', 'expected_not_positive', 'expected', v_expected, 'settled_rows', v_settled);
  end if;
  if p_completed_rows < 0 or v_settled + p_completed_rows > v_expected then
    return jsonb_build_object('settled', false, 'reason', 'overcount', 'expected', v_expected, 'settled_rows', v_settled);
  end if;
  if p_completed_rows <> 0 then
    update public.files set normalization_settled = v_settled + p_completed_rows where id = p_file_id;
    v_settled := v_settled + p_completed_rows;
  end if;
  if v_settled < v_expected then
    return jsonb_build_object('settled', false, 'reason', 'incomplete', 'expected', v_expected, 'settled_rows', v_settled);
  end if;
  update public.files set upload_status = 'normalized' where id = p_file_id and upload_status in ('processing', 'done');
  update public.processing_jobs set status = 'completed', completed_at = now() where file_id = p_file_id and status in ('uploaded', 'processing');
  return jsonb_build_object('settled', true, 'expected', v_expected, 'settled_rows', v_settled);
end;
$function$;

revoke all on function public.avint_settle_document_normalization(uuid, uuid, integer) from public, anon, authenticated;
grant execute on function public.avint_settle_document_normalization(uuid, uuid, integer) to service_role;

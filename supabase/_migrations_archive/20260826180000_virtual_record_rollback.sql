-- Restore a virtual projection from an immutable history snapshot.
-- The original document_fields row is intentionally left unchanged.

create or replace function public.rollback_virtual_record(
  p_user_id uuid,
  p_record_id uuid,
  p_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_record public.virtual_records%rowtype;
  snapshot public.virtual_record_versions%rowtype;
  next_version integer;
  restored_fields integer;
begin
  if p_user_id is null or p_record_id is null or p_version_id is null then
    raise exception 'rollback requires user, record, and version ids';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_record_id::text, 0));

  select * into current_record
  from public.virtual_records
  where id = p_record_id and user_id = p_user_id;
  if not found then raise exception 'virtual record not found'; end if;

  select * into snapshot
  from public.virtual_record_versions
  where id = p_version_id
    and virtual_record_id = p_record_id
    and user_id = p_user_id;
  if not found then raise exception 'history snapshot not found'; end if;

  update public.virtual_records
  set document_type = snapshot.document_type,
      record_type = snapshot.record_type,
      status = snapshot.status,
      normalization_version = snapshot.normalization_version,
      is_current = true,
      updated_at = now()
  where id = p_record_id and user_id = p_user_id;

  delete from public.virtual_record_fields
  where virtual_record_id = p_record_id and user_id = p_user_id;

  insert into public.virtual_record_fields (
    user_id, virtual_record_id, field_key, value, value_type,
    confidence, is_custom, source_evidence
  )
  select p_user_id, p_record_id, field_key, value, value_type,
         confidence, is_custom, source_evidence
  from public.virtual_record_version_fields
  where version_id = p_version_id and user_id = p_user_id;
  get diagnostics restored_fields = row_count;

  select coalesce(max(version_number), 0) + 1 into next_version
  from public.virtual_record_versions
  where virtual_record_id = p_record_id;

  insert into public.virtual_record_versions (
    user_id, virtual_record_id, source_record_id, version_number,
    document_type, record_type, status, normalization_version,
    change_reason
  ) values (
    p_user_id, p_record_id, snapshot.source_record_id, next_version,
    snapshot.document_type, snapshot.record_type, snapshot.status,
    snapshot.normalization_version, 'rollback'
  );

  return jsonb_build_object(
    'record_id', p_record_id,
    'restored_from_version_id', p_version_id,
    'restored_version_number', snapshot.version_number,
    'new_history_version', next_version,
    'restored_fields', restored_fields,
    'source_unchanged', true
  );
end;
$$;

revoke execute on function public.rollback_virtual_record(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.rollback_virtual_record(uuid, uuid, uuid) to service_role;

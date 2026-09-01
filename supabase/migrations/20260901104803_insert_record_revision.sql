-- Allocates revision_number and inserts the revision in one statement.
--
-- record_revisions has unique (record_id, revision_number). Computing
-- max + 1 in application code races: two concurrent corrections to the same
-- record both read the same max and the second insert fails with 23505.
--
-- The `for update` on the parent record serialises revision allocation per
-- record. Without it, coalesce(max) + 1 inside this function races exactly
-- the same way it would in TypeScript.
--
-- user_id and revision_number are derived here, never accepted from the
-- caller. actor and previous_value are the route's responsibility (session
-- and live record respectively) and are passed in.

create or replace function public.insert_record_revision(
  p_record_id      uuid,
  p_change_kind    text,
  p_target_kind    text,
  p_target         text,
  p_previous_value jsonb,
  p_new_value      jsonb,
  p_actor          text,
  p_note           text default null
) returns public.record_revisions
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_row     public.record_revisions;
begin
  -- locks the record for the duration of the transaction, serialising
  -- revision_number allocation for this record
  select user_id into v_user_id
    from public.records
   where id = p_record_id
     for update;

  if v_user_id is null then
    raise exception 'record not found: %', p_record_id
      using errcode = 'P0002';
  end if;

  if p_actor is null or btrim(p_actor) = '' then
    raise exception 'actor is required'
      using errcode = '22023';
  end if;

  insert into public.record_revisions (
    user_id, record_id, revision_number, change_kind, target_kind, target,
    previous_value, new_value, actor, note
  )
  select v_user_id,
         p_record_id,
         coalesce(max(rr.revision_number), 0) + 1,
         p_change_kind,
         p_target_kind,
         p_target,
         p_previous_value,
         p_new_value,
         p_actor,
         p_note
    from public.record_revisions rr
   where rr.record_id = p_record_id
  returning * into v_row;

  return v_row;
end;
$$;

-- Least privilege: the corrections route uses the service role. Nothing
-- client-facing may allocate a revision, which is why record_revisions has
-- no INSERT policy.
revoke all on function public.insert_record_revision(uuid, text, text, text, jsonb, jsonb, text, text) from public;
revoke all on function public.insert_record_revision(uuid, text, text, text, jsonb, jsonb, text, text) from anon;
revoke all on function public.insert_record_revision(uuid, text, text, text, jsonb, jsonb, text, text) from authenticated;
grant execute on function public.insert_record_revision(uuid, text, text, text, jsonb, jsonb, text, text) to service_role;

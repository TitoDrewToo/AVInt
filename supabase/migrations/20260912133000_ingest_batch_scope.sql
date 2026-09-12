-- Historical batches remain personal; never adopt them into a delegated scope.
alter table public.ingest_batches add column actor_user_id uuid;
alter table public.ingest_batches add column workflow_id uuid;
alter table public.ingest_batches add column intake_folder_id uuid;
-- Scope IDs are immutable audit identity, deliberately not SET NULL on deletion.
create or replace function public.avint_claim_scoped_ingest_batch(
  p_user_id uuid, p_idempotency_key text, p_request_hash text, p_items jsonb,
  p_actor_user_id uuid, p_workflow_id uuid default null, p_intake_folder_id uuid default null
) returns table(batch_id uuid,item_id uuid,item_index integer,item_status text,file_id uuid,lease_token uuid,claimed boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_batch public.ingest_batches%rowtype;
begin
  if p_actor_user_id is null or (p_workflow_id is null and p_actor_user_id <> p_user_id)
    or (p_workflow_id is not null and p_intake_folder_id is null) then raise exception 'Invalid batch scope'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_idempotency_key,0));
  select * into v_batch from public.ingest_batches b where b.user_id=p_user_id and b.idempotency_key=p_idempotency_key for update;
  if found and (coalesce(v_batch.actor_user_id,v_batch.user_id) is distinct from p_actor_user_id
    or v_batch.workflow_id is distinct from p_workflow_id or v_batch.intake_folder_id is distinct from p_intake_folder_id) then
    raise exception 'Idempotency key belongs to a different submission scope';
  end if;
  return query select * from public.avint_claim_ingest_batch(p_user_id,p_idempotency_key,p_request_hash,p_items);
  update public.ingest_batches b set actor_user_id=p_actor_user_id,workflow_id=p_workflow_id,intake_folder_id=p_intake_folder_id
    where b.user_id=p_user_id and b.idempotency_key=p_idempotency_key and b.actor_user_id is null;
end;
$$;
revoke all on function public.avint_claim_scoped_ingest_batch(uuid,text,text,jsonb,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.avint_claim_scoped_ingest_batch(uuid,text,text,jsonb,uuid,uuid,uuid) to service_role;

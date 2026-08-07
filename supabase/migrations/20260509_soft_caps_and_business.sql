-- Refine document metering: Free/Day Pass are hard caps; Pro/Business are
-- soft fair-use caps that continue processing with a warning.

drop function if exists public.avint_claim_document_processing(uuid, uuid, timestamptz, timestamptz, integer);

create or replace function public.avint_claim_document_processing(
  p_user_id uuid,
  p_file_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_limit integer,
  p_soft_cap boolean
)
returns table(allowed boolean, already_claimed boolean, used_count integer, limit_count integer, fair_use_warning boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_user uuid;
  current_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('document-processing:' || p_user_id::text || ':' || p_period_start::text));

  select user_id into existing_user
  from public.document_processing_usage
  where file_id = p_file_id;

  if existing_user is not null then
    if existing_user <> p_user_id then
      return query select false, true, 0, p_limit, false;
      return;
    end if;
    select count(*)::integer into current_count
    from public.document_processing_usage
    where user_id = p_user_id and period_start = p_period_start;
    return query select true, true, current_count, p_limit, p_soft_cap and current_count >= p_limit;
    return;
  end if;

  select count(*)::integer into current_count
  from public.document_processing_usage
  where user_id = p_user_id and period_start = p_period_start;

  if current_count >= p_limit and not p_soft_cap then
    return query select false, false, current_count, p_limit, false;
    return;
  end if;

  insert into public.document_processing_usage (user_id, file_id, period_start, period_end)
  values (p_user_id, p_file_id, p_period_start, p_period_end);

  return query select true, false, current_count + 1, p_limit, p_soft_cap and current_count + 1 >= p_limit;
end;
$$;

revoke all on function public.avint_claim_document_processing(uuid, uuid, timestamptz, timestamptz, integer, boolean) from public, anon, authenticated;
grant execute on function public.avint_claim_document_processing(uuid, uuid, timestamptz, timestamptz, integer, boolean) to service_role;

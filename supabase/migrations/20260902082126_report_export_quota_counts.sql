-- Report export quota: count exports instead of locking a user to one report.
--
-- APPLIED TO PRODUCTION 2026-09-02 via Supabase MCP apply_migration.
-- Version 20260902082126 is already recorded in supabase_migrations.schema_migrations.
-- This file exists so the repo reproduces the database. Do not run it.
--
-- Before this migration:
--   * report_export_usage had UNIQUE (user_id, period_start), so the table could
--     hold exactly one export row per user per period.
--   * avint_claim_report_export therefore never counted. It recorded the first
--     report_key a user touched and denied every OTHER report for the rest of
--     the period. p_limit was accepted, echoed back as limit_count, and never
--     compared to anything. used_count was hardcoded to 1.
--
-- Net effect: the free tier was "choose one report; the other six are locked
-- until next month" rather than "N exports per month". Raising PLAN_LIMITS
-- would have had no effect at all.
--
-- After this migration:
--   * One row per (user_id, period_start, report_key).
--   * The function counts rows in the period and compares against p_limit.
--   * Re-exporting a report already claimed in this period does NOT consume
--     another allowance -- a retried or repeated download is free.
--   * used_count is truthful, so the UI can show "3 of 5 used".
--   * p_limit null continues to mean unlimited (paid tiers).

alter table public.report_export_usage
  drop constraint if exists report_export_usage_user_id_period_start_key;

drop index if exists public.report_export_usage_user_id_period_start_key;

create unique index if not exists report_export_usage_user_period_report_key
  on public.report_export_usage (user_id, period_start, report_key);

create or replace function public.avint_claim_report_export(
  p_user_id uuid,
  p_report_key text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_limit integer
)
returns table(allowed boolean, already_claimed boolean, used_count integer, limit_count integer)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_used integer;
  v_claimed boolean;
begin
  -- Serialise concurrent claims for this user and period so two simultaneous
  -- exports cannot both pass the limit check.
  perform pg_advisory_xact_lock(
    hashtext('report-export:' || p_user_id::text || ':' || p_period_start::text)
  );

  select count(*) into v_used
  from public.report_export_usage
  where user_id = p_user_id
    and period_start = p_period_start;

  select exists (
    select 1
    from public.report_export_usage
    where user_id = p_user_id
      and period_start = p_period_start
      and report_key = p_report_key
  ) into v_claimed;

  -- Already claimed this report in this period: allow without charging again.
  if v_claimed then
    return query select true, true, v_used, p_limit;
    return;
  end if;

  -- Unlimited tier.
  if p_limit is null then
    insert into public.report_export_usage (user_id, report_key, period_start, period_end)
    values (p_user_id, p_report_key, p_period_start, p_period_end);
    return query select true, false, v_used + 1, p_limit;
    return;
  end if;

  -- Metered tier at or over the limit.
  if v_used >= p_limit then
    return query select false, false, v_used, p_limit;
    return;
  end if;

  insert into public.report_export_usage (user_id, report_key, period_start, period_end)
  values (p_user_id, p_report_key, p_period_start, p_period_end);

  return query select true, false, v_used + 1, p_limit;
end;
$function$;

grant execute on function public.avint_claim_report_export(uuid, text, timestamptz, timestamptz, integer) to service_role;

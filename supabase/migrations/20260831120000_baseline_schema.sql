-- =====================================================================
-- BASELINE SCHEMA — public schema as it exists in production.
--
-- Taken with pg_dump --schema-only against the live database on
-- 2026-08-31 and verified against the catalog: 43 tables, 27 functions,
-- 55 RLS policies, 0 enums — matching production exactly.
--
-- WHY THIS EXISTS
-- The migration history had drifted past repair: 61 files across 34
-- version prefixes, 8 of them colliding (so the CLI silently skipped all
-- but the first file of each), 24 versions recorded, and several tables —
-- notably public.folders — with no migration file at all. The repo could
-- not rebuild production, and a tidied-up history would have looked
-- trustworthy without being so.
--
-- The 61 historical files are preserved, unmodified, in
-- supabase/_migrations_archive/. They are out of the apply path and are
-- kept as a record, not as something replayable.
--
-- FROM HERE
-- Every new migration is applied once, recorded with a unique version,
-- and lives in this directory under a filename matching that version.
--
-- NOT CAPTURED BY THIS FILE — see supabase/migrations/README.md:
--   extensions, pg_cron schedules, Vault secrets, storage buckets.
-- =====================================================================

-- Extensions this schema depends on. Supabase provisions plpgsql,
-- pg_stat_statements and supabase_vault by default; these are the ones
-- that must be enabled explicitly on a fresh project.
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto   with schema extensions;
create extension if not exists pg_net     with schema public;
create extension if not exists pg_cron;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: avint_claim_document_processing(uuid, uuid, timestamp with time zone, timestamp with time zone, integer, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.avint_claim_document_processing(p_user_id uuid, p_file_id uuid, p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_limit integer, p_soft_cap boolean) RETURNS TABLE(allowed boolean, already_claimed boolean, used_count integer, limit_count integer, fair_use_warning boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: avint_claim_report_export(uuid, text, timestamp with time zone, timestamp with time zone, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.avint_claim_report_export(p_user_id uuid, p_report_key text, p_period_start timestamp with time zone, p_period_end timestamp with time zone, p_limit integer) RETURNS TABLE(allowed boolean, already_claimed boolean, used_count integer, limit_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  existing_report text;
begin
  perform pg_advisory_xact_lock(hashtext('report-export:' || p_user_id::text || ':' || p_period_start::text));

  select report_key into existing_report
  from public.report_export_usage
  where user_id = p_user_id and period_start = p_period_start;

  if existing_report is not null then
    return query select existing_report = p_report_key, true, 1, p_limit;
    return;
  end if;

  insert into public.report_export_usage (user_id, report_key, period_start, period_end)
  values (p_user_id, p_report_key, p_period_start, p_period_end);

  return query select true, false, 1, p_limit;
end;
$$;


--
-- Name: avint_enforce_file_storage_quota(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.avint_enforce_file_storage_quota() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  current_bytes bigint;
  quota_bytes bigint;
begin
  if new.user_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.user_id::text));

  select coalesce(sum(file_size), 0)
  into current_bytes
  from public.files
  where user_id = new.user_id
    and id is distinct from new.id;

  quota_bytes := public.avint_storage_quota_bytes(new.user_id);

  if current_bytes + coalesce(new.file_size, 0) > quota_bytes then
    raise exception 'Storage quota exceeded'
      using errcode = '23514';
  end if;

  return new;
end;
$$;


--
-- Name: avint_settle_document_normalization(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.avint_settle_document_normalization(p_file_id uuid, p_batch_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: avint_storage_quota_bytes(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.avint_storage_quota_bytes(p_user_id uuid) RETURNS bigint
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare sub record; firm_start timestamptz;
begin
  select status, plan, current_period_end into sub from public.subscriptions where user_id = p_user_id order by updated_at desc nulls last, created_at desc limit 1;
  if sub.status = 'pro' then if sub.plan = 'annual' then return 2199023255552; end if; return 1099511627776; end if;
  select fc.created_at into firm_start from public.firm_clients fc join public.firms f on f.id = fc.firm_id
    where fc.user_id = p_user_id and f.status = 'active' and fc.created_at > now() - interval '1 year' order by fc.created_at desc limit 1;
  if firm_start is not null then return 2199023255552; end if;
  return 5368709120;
end; $$;


--
-- Name: delete_user_data(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.delete_user_data(p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_paths        text[];
  v_df_count     int;
  v_pj_count     int;
  v_po_count     int;
  v_files_count  int;
  v_aw_count     int;
  v_dl_count     int;
  v_cs_count     int;
  v_ra_count     int;
  v_uap_count    int;
  v_subs_count   int;
begin
  select coalesce(array_agg(storage_path) filter (where storage_path is not null), '{}')
    into v_paths
    from files
   where user_id = p_user_id;

  with d as (
    delete from document_fields
     where file_id in (select id from files where user_id = p_user_id)
     returning 1
  )
  select count(*) into v_df_count from d;

  with d as (
    delete from processing_jobs
     where file_id in (select id from files where user_id = p_user_id)
     returning 1
  )
  select count(*) into v_pj_count from d;

  with d as (
    delete from payment_obligations where user_id = p_user_id returning 1
  )
  select count(*) into v_po_count from d;

  with d as (
    delete from files where user_id = p_user_id returning 1
  )
  select count(*) into v_files_count from d;

  with d as (
    delete from advanced_widgets where user_id = p_user_id returning 1
  )
  select count(*) into v_aw_count from d;

  with d as (
    delete from dashboard_layouts where user_id = p_user_id returning 1
  )
  select count(*) into v_dl_count from d;

  with d as (
    delete from context_summaries where user_id = p_user_id returning 1
  )
  select count(*) into v_cs_count from d;

  with d as (
    delete from report_assumptions where user_id = p_user_id returning 1
  )
  select count(*) into v_ra_count from d;

  with d as (
    delete from user_analytics_profile where user_id = p_user_id returning 1
  )
  select count(*) into v_uap_count from d;

  update subscriptions
     set user_id = null, email = null
   where user_id = p_user_id;
  get diagnostics v_subs_count = ROW_COUNT;

  return jsonb_build_object(
    'storage_paths', v_paths,
    'counts', jsonb_build_object(
      'document_fields',          v_df_count,
      'processing_jobs',          v_pj_count,
      'payment_obligations',      v_po_count,
      'files',                    v_files_count,
      'advanced_widgets',         v_aw_count,
      'dashboard_layouts',        v_dl_count,
      'context_summaries',        v_cs_count,
      'report_assumptions',       v_ra_count,
      'user_analytics_profile',   v_uap_count,
      'subscriptions_anonymized', v_subs_count
    )
  );
end
$$;


--
-- Name: enroll_firm_client(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enroll_firm_client(p_firm_id uuid, p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare firm_row public.firms%rowtype; existing_id uuid;
begin
  if p_firm_id is null or p_user_id is null then return jsonb_build_object('ok', false, 'code', 'invalid_input'); end if;
  select * into firm_row from public.firms where id = p_firm_id for update;
  if not found or firm_row.status <> 'active' then return jsonb_build_object('ok', false, 'code', 'firm_unavailable'); end if;
  select id into existing_id from public.firm_clients where firm_id = p_firm_id and user_id = p_user_id;
  if existing_id is not null then return jsonb_build_object('ok', true, 'enrolled', true, 'seat_consumed', false, 'firm_id', p_firm_id); end if;
  if firm_row.seats_used >= firm_row.seats_purchased then return jsonb_build_object('ok', false, 'code', 'seats_full'); end if;
  insert into public.firm_clients (firm_id, user_id, seat_consumed) values (p_firm_id, p_user_id, true);
  update public.firms set seats_used = seats_used + 1 where id = p_firm_id;
  return jsonb_build_object('ok', true, 'enrolled', true, 'seat_consumed', true, 'firm_id', p_firm_id);
end; $$;


--
-- Name: get_record_amounts_by_category(uuid, date, date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_record_amounts_by_category(p_user_id uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_limit integer DEFAULT 25) RETURNS TABLE(category text, direction text, record_count bigint, amount numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with grouped as (
    select coalesce(nullif(trim(r.category), ''), 'Uncategorized') as category,
           r.direction, count(*)::bigint as record_count, coalesce(sum(r.amount), 0) as amount
    from public.records r
    where r.user_id = p_user_id and r.parent_record_id is null
      and (p_from is null or r.occurred_on >= p_from)
      and (p_to is null or r.occurred_on <= p_to)
    group by 1, 2
  ), ranked as (
    select grouped.*, row_number() over (order by amount desc, category, direction) as rank
    from grouped
  ), top_rows as (
    select category, direction, record_count, amount from ranked
    where rank <= greatest(coalesce(p_limit, 25), 1)
  ), other_row as (
    select 'Other'::text as category, 'mixed'::text as direction,
           sum(record_count)::bigint as record_count, sum(amount) as amount
    from ranked where rank > greatest(coalesce(p_limit, 25), 1)
    having count(*) > 0
  )
  select * from top_rows union all select * from other_row
  order by amount desc, category, direction;
$$;


--
-- Name: get_record_amounts_by_counterparty(uuid, date, date, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_record_amounts_by_counterparty(p_user_id uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date, p_limit integer DEFAULT 25) RETURNS TABLE(counterparty text, direction text, record_count bigint, amount numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with grouped as (
    select coalesce(nullif(trim(r.counterparty), ''), 'Unattributed') as counterparty,
           r.direction, count(*)::bigint as record_count, coalesce(sum(r.amount), 0) as amount
    from public.records r
    where r.user_id = p_user_id and r.parent_record_id is null
      and (p_from is null or r.occurred_on >= p_from)
      and (p_to is null or r.occurred_on <= p_to)
    group by 1, 2
  ), ranked as (
    select grouped.*, row_number() over (order by amount desc, counterparty, direction) as rank
    from grouped
  ), top_rows as (
    select counterparty, direction, record_count, amount from ranked
    where rank <= greatest(coalesce(p_limit, 25), 1)
  ), other_row as (
    select 'Other'::text as counterparty, 'mixed'::text as direction,
           sum(record_count)::bigint as record_count, sum(amount) as amount
    from ranked where rank > greatest(coalesce(p_limit, 25), 1)
    having count(*) > 0
  )
  select * from top_rows union all select * from other_row
  order by amount desc, counterparty, direction;
$$;


--
-- Name: get_record_amounts_by_direction(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_record_amounts_by_direction(p_user_id uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date) RETURNS TABLE(direction text, record_count bigint, amount numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select r.direction, count(*)::bigint, coalesce(sum(r.amount), 0)
  from public.records r
  where r.user_id = p_user_id and r.parent_record_id is null
    and (p_from is null or r.occurred_on >= p_from)
    and (p_to is null or r.occurred_on <= p_to)
  group by r.direction
  order by r.direction;
$$;


--
-- Name: get_record_amounts_by_month(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_record_amounts_by_month(p_user_id uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date) RETURNS TABLE(period_start date, direction text, record_count bigint, amount numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select date_trunc('month', r.occurred_on)::date, r.direction, count(*)::bigint, coalesce(sum(r.amount), 0)
  from public.records r
  where r.user_id = p_user_id and r.parent_record_id is null and r.occurred_on is not null
    and (p_from is null or r.occurred_on >= p_from)
    and (p_to is null or r.occurred_on <= p_to)
  group by 1, r.direction
  order by 1, r.direction;
$$;


--
-- Name: get_record_summary(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_record_summary(p_user_id uuid, p_from date DEFAULT NULL::date, p_to date DEFAULT NULL::date) RETURNS TABLE(record_count bigint, inflow_count bigint, outflow_count bigint, neutral_count bigint, total_inflow numeric, total_outflow numeric, needs_review_count bigint, months_tracked bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with scoped as (
    select * from public.records
    where user_id = p_user_id
      and parent_record_id is null
      and (p_from is null or occurred_on >= p_from)
      and (p_to is null or occurred_on <= p_to)
  )
  select
    count(*)::bigint,
    count(*) filter (where direction = 'inflow')::bigint,
    count(*) filter (where direction = 'outflow')::bigint,
    count(*) filter (where direction = 'neutral')::bigint,
    coalesce(sum(amount) filter (where direction = 'inflow'), 0),
    coalesce(sum(amount) filter (where direction = 'outflow'), 0),
    count(*) filter (where needs_review)::bigint,
    count(distinct date_trunc('month', occurred_on)) filter (where occurred_on is not null)::bigint
  from scoped;
$$;


--
-- Name: get_user_id_by_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_id_by_email(p_email text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth'
    AS $$
  select id from auth.users where email = p_email limit 1;
$$;


--
-- Name: handle_new_user_subscription(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user_subscription() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.subscriptions (user_id, status)
  values (new.id, 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$$;


--
-- Name: increment_user_counter(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_user_counter() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update user_counter set total_users = total_users + 1 where id = 1;
end;
$$;


--
-- Name: is_firm_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_firm_admin(p_firm_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.is_firm_admin(p_firm_id, auth.uid());
$$;


--
-- Name: is_firm_admin(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_firm_admin(p_firm_id uuid, p_user_id uuid DEFAULT auth.uid()) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$ select exists (select 1 from public.firm_admins where firm_id = p_firm_id and user_id = p_user_id); $$;


--
-- Name: is_system_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_system_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.system_admins
    where user_id = auth.uid()
  );
$$;


--
-- Name: rate_limit_hit(text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rate_limit_hit(p_bucket text, p_key text, p_window_seconds integer, p_max_calls integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_window  timestamptz;
  v_count   integer;
begin
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into rate_limits (bucket, key, window_start, count)
  values (p_bucket, p_key, v_window, 1)
  on conflict (bucket, key, window_start)
  do update set count = rate_limits.count + 1
  returning count into v_count;

  return v_count <= p_max_calls;
end
$$;


--
-- Name: record_error_event(uuid, text, text, text, text, text, text, text, text, jsonb, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_error_event(p_user_id uuid, p_tool text, p_fn text, p_action text, p_route text, p_level text, p_message text, p_stack text, p_fingerprint text, p_context jsonb, p_release text, p_environment text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  event_id uuid;
  event_time timestamptz := now();
begin
  insert into public.error_events (
    occurred_at, user_id, tool, fn, action, route, level, message, stack,
    fingerprint, context, release, environment
  ) values (
    event_time, p_user_id, p_tool, p_fn, p_action, p_route, p_level,
    p_message, p_stack, p_fingerprint, p_context, p_release, p_environment
  ) returning id into event_id;

  insert into public.error_groups (fingerprint, title, first_seen, last_seen, count)
  values (p_fingerprint, p_message, event_time, event_time, 1)
  on conflict (fingerprint) do update set
    last_seen = excluded.last_seen,
    count = public.error_groups.count + 1;

  return event_id;
end;
$$;


--
-- Name: record_firm_seat_purchase(uuid, text, text, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_firm_seat_purchase(p_firm_id uuid, p_event_id text, p_order_id text, p_product_id text, p_units integer, p_amount_cents integer DEFAULT NULL::integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare inserted_id uuid;
begin
  if p_firm_id is null or p_event_id is null or p_event_id = '' or p_units is null or p_units < 1 or p_units > 10000 then return jsonb_build_object('ok', false, 'code', 'invalid_input'); end if;
  insert into public.firm_seat_purchases (firm_id, event_id, order_id, product_id, units, amount_cents)
  values (p_firm_id, p_event_id, p_order_id, p_product_id, p_units, p_amount_cents)
  on conflict (provider, event_id) do nothing returning id into inserted_id;
  if inserted_id is null then return jsonb_build_object('ok', true, 'duplicate', true); end if;
  update public.firms set seats_purchased = seats_purchased + p_units where id = p_firm_id;
  if not found then delete from public.firm_seat_purchases where id = inserted_id; return jsonb_build_object('ok', false, 'code', 'firm_not_found'); end if;
  return jsonb_build_object('ok', true, 'duplicate', false, 'units', p_units);
end; $$;


--
-- Name: redeem_gift_code(text, uuid, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.redeem_gift_code(p_code text, p_user_id uuid, p_email text, p_access_ends_at timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_code_row gift_codes%rowtype;
  v_now      timestamptz := now();
begin
  update gift_codes
     set status              = 'redeemed',
         redeemed_by_user_id = p_user_id,
         redeemed_at         = v_now
   where code   = p_code
     and status = 'pending'
     and (expires_at is null or expires_at > v_now)
   returning * into v_code_row;

  if not found then
    select * into v_code_row from gift_codes where code = p_code;
    if not found then
      return jsonb_build_object('result', 'invalid');
    end if;
    if v_code_row.status = 'redeemed' then
      return jsonb_build_object('result', 'already_redeemed');
    end if;
    if v_code_row.expires_at is not null and v_code_row.expires_at <= v_now then
      return jsonb_build_object('result', 'expired');
    end if;
    return jsonb_build_object('result', 'invalid');
  end if;

  -- Manual upsert — subscriptions has no unique constraint on user_id,
  -- only an index, so on-conflict isn't available here.
  update subscriptions
     set email              = p_email,
         status             = 'gift_code',
         plan               = 'gift_code',
         current_period_end = p_access_ends_at,
         updated_at         = v_now
   where user_id = p_user_id;

  if not found then
    insert into subscriptions (user_id, email, status, plan, current_period_end, updated_at)
    values (p_user_id, p_email, 'gift_code', 'gift_code', p_access_ends_at, v_now);
  end if;

  return jsonb_build_object(
    'result', 'redeemed',
    'plan',   v_code_row.plan
  );
end;
$$;


--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


--
-- Name: rollback_virtual_record(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rollback_virtual_record(p_user_id uuid, p_record_id uuid, p_version_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: set_virtual_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_virtual_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: sweep_stuck_processing_jobs(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sweep_stuck_processing_jobs() RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with swept as (
    update processing_jobs
       set status        = 'failed',
           error_message = coalesce(error_message, 'Stuck job — swept after 30 minutes'),
           completed_at  = coalesce(completed_at, now())
     where status in ('uploaded', 'processing')
       and created_at < now() - interval '30 minutes'
     returning id
  )
  select count(*)::int from swept;
$$;


--
-- Name: update_payment_obligations_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_payment_obligations_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: advanced_widgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.advanced_widgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    widget_type text NOT NULL,
    title text NOT NULL,
    description text,
    insight text,
    config jsonb DEFAULT '{}'::jsonb,
    is_starred boolean DEFAULT false NOT NULL,
    is_plotted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone
);


--
-- Name: ai_usage_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid,
    file_id uuid,
    document_field_id uuid,
    file_type text,
    file_size_bytes bigint,
    source_row_count integer,
    extracted_row_count integer,
    document_type text,
    workload_class text DEFAULT 'document'::text NOT NULL,
    operation text NOT NULL,
    provider text NOT NULL,
    model text NOT NULL,
    attempt_number integer DEFAULT 1 NOT NULL,
    status text NOT NULL,
    input_tokens integer,
    output_tokens integer,
    estimated_cost_usd numeric(14,8) DEFAULT 0 NOT NULL,
    is_retry boolean DEFAULT false NOT NULL,
    is_fallback boolean DEFAULT false NOT NULL,
    billable_to_user boolean DEFAULT false NOT NULL,
    error_category text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    pricing_version text DEFAULT '2026-08-26-v1'::text NOT NULL,
    duration_ms integer,
    CONSTRAINT ai_usage_events_attempt_number_check CHECK ((attempt_number > 0)),
    CONSTRAINT ai_usage_events_duration_ms_check CHECK (((duration_ms IS NULL) OR (duration_ms >= 0))),
    CONSTRAINT ai_usage_events_estimated_cost_usd_check CHECK ((estimated_cost_usd >= (0)::numeric)),
    CONSTRAINT ai_usage_events_extracted_row_count_check CHECK (((extracted_row_count IS NULL) OR (extracted_row_count >= 0))),
    CONSTRAINT ai_usage_events_file_size_bytes_check CHECK (((file_size_bytes IS NULL) OR (file_size_bytes >= 0))),
    CONSTRAINT ai_usage_events_input_tokens_check CHECK (((input_tokens IS NULL) OR (input_tokens >= 0))),
    CONSTRAINT ai_usage_events_operation_check CHECK ((operation = ANY (ARRAY['prescan_safety'::text, 'extraction'::text, 'spreadsheet_header_mapping'::text, 'normalization'::text]))),
    CONSTRAINT ai_usage_events_output_tokens_check CHECK (((output_tokens IS NULL) OR (output_tokens >= 0))),
    CONSTRAINT ai_usage_events_provider_check CHECK ((provider = ANY (ARRAY['openai'::text, 'anthropic'::text, 'gemini'::text]))),
    CONSTRAINT ai_usage_events_source_row_count_check CHECK (((source_row_count IS NULL) OR (source_row_count >= 0))),
    CONSTRAINT ai_usage_events_status_check CHECK ((status = ANY (ARRAY['succeeded'::text, 'failed'::text])))
);


--
-- Name: context_summaries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.context_summaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    summary text NOT NULL,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    document_count integer,
    ai_provider text DEFAULT 'anthropic'::text
);


--
-- Name: dashboard_layouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dashboard_layouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    layout jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: document_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_id uuid,
    vendor_name text,
    employer_name text,
    document_date date,
    currency text,
    total_amount numeric,
    gross_income numeric,
    net_income numeric,
    expense_category text,
    confidence_score numeric,
    raw_json jsonb,
    created_at timestamp without time zone DEFAULT now(),
    tax_amount numeric,
    discount_amount numeric,
    invoice_number text,
    payment_method text,
    period_start date,
    period_end date,
    counterparty_name text,
    line_items jsonb,
    normalization_status text DEFAULT 'raw'::text,
    normalized_at timestamp with time zone,
    normalization_error text,
    income_source text,
    vendor_normalized text,
    jurisdiction text,
    classification_rationale text,
    normalization_version integer DEFAULT 1,
    merchant_domain text,
    merchant_address_city text,
    merchant_address_region text,
    merchant_address_country text,
    is_recurring boolean DEFAULT false,
    recurrence_cadence text,
    normalization_attempts integer DEFAULT 0 NOT NULL,
    normalization_batch_id uuid,
    source_key text NOT NULL,
    CONSTRAINT chk_income_source CHECK (((income_source IS NULL) OR (income_source = ANY (ARRAY['business'::text, 'wage'::text, 'investment'::text, 'rental'::text, 'interest'::text, 'other'::text])))),
    CONSTRAINT chk_merchant_domain CHECK (((merchant_domain IS NULL) OR (merchant_domain = ANY (ARRAY['food_service'::text, 'grocery'::text, 'fuel'::text, 'transit'::text, 'travel'::text, 'retail'::text, 'software_saas'::text, 'telecom'::text, 'utilities'::text, 'professional_services'::text, 'healthcare'::text, 'financial_services'::text, 'government'::text, 'education'::text, 'entertainment'::text, 'home_office'::text, 'other'::text])))),
    CONSTRAINT chk_normalization_status CHECK ((normalization_status = ANY (ARRAY['raw'::text, 'normalized'::text, 'failed'::text, 'manual'::text, 'excluded'::text]))),
    CONSTRAINT chk_recurrence_cadence CHECK (((recurrence_cadence IS NULL) OR (recurrence_cadence = ANY (ARRAY['weekly'::text, 'biweekly'::text, 'monthly'::text, 'quarterly'::text, 'annual'::text, 'irregular'::text]))))
);


--
-- Name: document_processing_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_processing_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    file_id uuid NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    processed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: error_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.error_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    occurred_at_manila timestamp without time zone GENERATED ALWAYS AS ((occurred_at AT TIME ZONE 'Asia/Manila'::text)) STORED,
    user_id uuid,
    tool text,
    fn text,
    action text,
    route text,
    level text NOT NULL,
    message text NOT NULL,
    stack text,
    fingerprint text NOT NULL,
    context jsonb,
    release text,
    environment text,
    CONSTRAINT error_events_level_check CHECK ((level = ANY (ARRAY['error'::text, 'warn'::text, 'info'::text])))
);


--
-- Name: error_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.error_groups (
    fingerprint text NOT NULL,
    title text NOT NULL,
    first_seen timestamp with time zone DEFAULT now() NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    ai_analysis text,
    proposed_fix text,
    risk_level text,
    confidence numeric,
    severity text,
    diagnosed_at timestamp with time zone,
    ai_model text,
    review_verdict text,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    context_scope text,
    action_taken text,
    action_taken_at timestamp with time zone,
    action_taken_by uuid,
    CONSTRAINT error_groups_confidence_check CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
    CONSTRAINT error_groups_review_verdict_check CHECK ((review_verdict = ANY (ARRAY['matched'::text, 'partial'::text, 'wrong'::text]))),
    CONSTRAINT error_groups_risk_level_check CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])))
);


--
-- Name: COLUMN error_groups.context_scope; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.error_groups.context_scope IS 'Journal retrieval scope used by the last diagnosis, e.g. "week/narrow" (timeWindow/topicScope). Observation-only.';


--
-- Name: extractions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.extractions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    file_id uuid NOT NULL,
    attempt_number integer DEFAULT 1 NOT NULL,
    provider text,
    model text,
    status text DEFAULT 'succeeded'::text NOT NULL,
    payload jsonb NOT NULL,
    document_type text,
    source_row_count integer,
    error_category text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.files (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    filename text NOT NULL,
    storage_path text NOT NULL,
    file_type text NOT NULL,
    file_size integer,
    document_type text NOT NULL,
    upload_status text DEFAULT 'uploaded'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    folder_id uuid,
    sha256 text,
    scan_reason text,
    scanned_at timestamp with time zone,
    analysis_json jsonb,
    analyzed_at timestamp with time zone,
    source_rows_json jsonb,
    normalization_batch_id uuid,
    source_provider text,
    source_file_id text,
    source_url text,
    source_modified_at timestamp with time zone,
    CONSTRAINT files_source_provider_check CHECK (((source_provider IS NULL) OR (source_provider = 'google_drive'::text))),
    CONSTRAINT files_upload_status_check CHECK ((upload_status = ANY (ARRAY['uploaded'::text, 'pending_scan'::text, 'scanning'::text, 'approved'::text, 'processing'::text, 'normalized'::text, 'done'::text, 'quarantined'::text])))
);


--
-- Name: firm_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.firm_admins (
    firm_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: firm_clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.firm_clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    firm_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    seat_consumed boolean DEFAULT true NOT NULL
);


--
-- Name: firm_seat_purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.firm_seat_purchases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    firm_id uuid NOT NULL,
    provider text DEFAULT 'creem'::text NOT NULL,
    event_id text NOT NULL,
    order_id text,
    product_id text NOT NULL,
    units integer NOT NULL,
    amount_cents integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: firms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.firms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    logo_url text,
    status text DEFAULT 'active'::text NOT NULL,
    seats_purchased integer DEFAULT 0 NOT NULL,
    seats_used integer DEFAULT 0 NOT NULL,
    partner_rate_cents integer DEFAULT 10000 NOT NULL,
    founding boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    CONSTRAINT firms_partner_rate_check CHECK ((partner_rate_cents > 0)),
    CONSTRAINT firms_seats_check CHECK (((seats_purchased >= 0) AND (seats_used >= 0) AND (seats_used <= seats_purchased))),
    CONSTRAINT firms_slug_format CHECK ((slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text)),
    CONSTRAINT firms_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'closed'::text])))
);


--
-- Name: folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    name text NOT NULL,
    parent_id uuid,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: fx_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fx_rates (
    rate_date date NOT NULL,
    base_currency text NOT NULL,
    target_currency text NOT NULL,
    rate numeric(20,8) NOT NULL,
    source text DEFAULT 'frankfurter'::text NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gift_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gift_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    duration_hours integer NOT NULL,
    issued_by_user_id uuid,
    redeemed_by_user_id uuid,
    redeemed_at timestamp without time zone,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    plan text DEFAULT 'monthly'::text NOT NULL,
    expires_at timestamp with time zone,
    purchased_by_email text,
    lemonsqueezy_order_id text,
    lemonsqueezy_license_id text
);


--
-- Name: google_drive_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_drive_connections (
    user_id uuid NOT NULL,
    google_subject text NOT NULL,
    google_email text,
    encrypted_refresh_token text NOT NULL,
    access_token_expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: partner_inquiries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.partner_inquiries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    firm text NOT NULL,
    email text NOT NULL,
    client_count integer,
    message text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    CONSTRAINT partner_inquiries_client_count_check CHECK (((client_count IS NULL) OR (client_count >= 0))),
    CONSTRAINT partner_inquiries_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'closed'::text])))
);


--
-- Name: payment_obligations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_obligations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    file_id uuid NOT NULL,
    counterparty_name text,
    description text,
    amount numeric(14,2),
    currency text DEFAULT 'PHP'::text,
    due_date date NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    paid_at date,
    paid_via text,
    notes text,
    check_number text,
    bank_name text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    record_id uuid,
    CONSTRAINT payment_obligations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'disputed'::text])))
);


--
-- Name: processed_webhook_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.processed_webhook_events (
    provider text DEFAULT 'creem'::text NOT NULL,
    event_id text NOT NULL,
    event_type text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: processing_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.processing_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    file_id uuid,
    status text NOT NULL,
    error_message text,
    created_at timestamp without time zone DEFAULT now(),
    completed_at timestamp without time zone
);


--
-- Name: rate_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rate_limits (
    bucket text NOT NULL,
    key text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    count integer DEFAULT 1 NOT NULL
);


--
-- Name: record_attributes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.record_attributes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    record_id uuid NOT NULL,
    field_key text NOT NULL,
    value jsonb,
    value_type text NOT NULL,
    confidence numeric(4,3),
    is_custom boolean DEFAULT false NOT NULL,
    source_evidence jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT record_attributes_value_type_check CHECK ((value_type = ANY (ARRAY['string'::text, 'number'::text, 'boolean'::text, 'date'::text, 'array'::text, 'object'::text, 'null'::text])))
);


--
-- Name: record_revisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.record_revisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    record_id uuid NOT NULL,
    revision_number integer NOT NULL,
    change_kind text NOT NULL,
    target_kind text NOT NULL,
    target text NOT NULL,
    previous_value jsonb,
    new_value jsonb,
    actor text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT record_revisions_change_kind_check CHECK ((change_kind = ANY (ARRAY['extraction'::text, 'user_edit'::text, 'reclassify'::text, 'rollback'::text]))),
    CONSTRAINT record_revisions_target_kind_check CHECK ((target_kind = ANY (ARRAY['column'::text, 'attribute'::text])))
);


--
-- Name: records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    file_id uuid NOT NULL,
    extraction_id uuid NOT NULL,
    parent_record_id uuid,
    source_key text NOT NULL,
    line_index integer,
    source_row_ref text,
    record_type text NOT NULL,
    document_type text,
    occurred_on date,
    period_start date,
    period_end date,
    amount numeric(18,4),
    currency text,
    amount_base numeric(18,4),
    fx_rate numeric(18,8),
    fx_rate_date date,
    direction text,
    counterparty text,
    counterparty_normalized text,
    category text,
    description text,
    is_recurring boolean,
    confidence numeric(4,3),
    field_confidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    needs_review boolean DEFAULT false NOT NULL,
    has_user_edits boolean DEFAULT false NOT NULL,
    status text DEFAULT 'derived'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT records_direction_check CHECK (((direction IS NULL) OR (direction = ANY (ARRAY['inflow'::text, 'outflow'::text, 'neutral'::text])))),
    CONSTRAINT records_status_check CHECK ((status = ANY (ARRAY['derived'::text, 'reviewed'::text, 'superseded'::text])))
);


--
-- Name: report_assumptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_assumptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    scope text NOT NULL,
    filing_context text NOT NULL,
    federal_marginal_rate numeric(5,2) DEFAULT 22 NOT NULL,
    state_marginal_rate numeric(5,2) DEFAULT 0 NOT NULL,
    include_self_employment_tax boolean DEFAULT true NOT NULL,
    self_employment_tax_rate numeric(5,2) DEFAULT 15.3 NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT report_assumptions_filing_context_check CHECK ((filing_context = ANY (ARRAY['self_employed'::text, 'employed'::text]))),
    CONSTRAINT report_assumptions_scope_check CHECK ((scope = 'business_expense'::text))
);


--
-- Name: report_export_usage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_export_usage (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    report_key text NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    exported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: retired_api_keys_20260823; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retired_api_keys_20260823 (
    id uuid,
    user_id uuid,
    key_hash text,
    prefix text,
    name text,
    scopes text[],
    created_at timestamp with time zone,
    last_used_at timestamp with time zone,
    revoked_at timestamp with time zone,
    expires_at timestamp with time zone
);


--
-- Name: smart_security_blocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.smart_security_blocks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    subject_type text NOT NULL,
    subject_value text NOT NULL,
    reason text NOT NULL,
    created_by text DEFAULT 'system'::text NOT NULL,
    expires_at timestamp with time zone,
    CONSTRAINT smart_security_blocks_subject_type_check CHECK ((subject_type = ANY (ARRAY['fingerprint'::text, 'user'::text, 'ip_prefix'::text])))
);


--
-- Name: smart_security_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.smart_security_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    app_id text NOT NULL,
    source text NOT NULL,
    decision text NOT NULL,
    reason text NOT NULL,
    risk_score numeric DEFAULT 0 NOT NULL,
    fingerprint text NOT NULL,
    user_id uuid,
    session_id text,
    ip_prefix text,
    method text,
    path text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: smart_security_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.smart_security_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    app_id text NOT NULL,
    event_type text NOT NULL,
    source text NOT NULL,
    user_id uuid,
    session_id text,
    fingerprint text,
    ip_prefix text,
    method text,
    path text,
    severity text DEFAULT 'low'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: studio_inquiries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.studio_inquiries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    company text,
    message text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    CONSTRAINT studio_inquiries_status_check CHECK ((status = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'closed'::text])))
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    status text DEFAULT 'free'::text NOT NULL,
    plan text,
    current_period_start timestamp without time zone,
    current_period_end timestamp without time zone,
    lemonsqueezy_subscription_id text,
    lemonsqueezy_customer_id text,
    lemonsqueezy_order_id text,
    gift_code_used text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    email text,
    product_name text,
    variant_id text
);


--
-- Name: system_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_admins (
    user_id uuid NOT NULL
);


--
-- Name: user_analytics_profile; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_analytics_profile (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    top_vendors jsonb DEFAULT '[]'::jsonb,
    payment_methods jsonb DEFAULT '{}'::jsonb,
    monthly_deltas jsonb DEFAULT '[]'::jsonb,
    discount_total numeric(12,2) DEFAULT 0,
    discount_events jsonb DEFAULT '[]'::jsonb,
    income_sources jsonb DEFAULT '[]'::jsonb,
    tax_timeline jsonb DEFAULT '[]'::jsonb,
    dominant_category text,
    avg_monthly_income numeric(12,2) DEFAULT 0,
    avg_monthly_expenses numeric(12,2) DEFAULT 0,
    document_count integer DEFAULT 0,
    months_tracked integer DEFAULT 0,
    last_run_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_run_signature jsonb
);


--
-- Name: user_counter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_counter (
    id integer DEFAULT 1 NOT NULL,
    total_users integer DEFAULT 0 NOT NULL,
    CONSTRAINT single_row CHECK ((id = 1))
);


--
-- Name: user_referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_referrals (
    user_id uuid NOT NULL,
    partner_code text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: virtual_field_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.virtual_field_catalog (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    field_key text NOT NULL,
    label text NOT NULL,
    value_types text[] DEFAULT '{}'::text[] NOT NULL,
    occurrence_count integer DEFAULT 0 NOT NULL,
    is_custom boolean DEFAULT false NOT NULL,
    source_kinds text[] DEFAULT '{}'::text[] NOT NULL,
    first_seen timestamp with time zone DEFAULT now() NOT NULL,
    last_seen timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: virtual_record_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.virtual_record_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    virtual_record_id uuid NOT NULL,
    field_key text NOT NULL,
    value jsonb,
    value_type text NOT NULL,
    confidence numeric,
    is_custom boolean DEFAULT false NOT NULL,
    source_evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT virtual_record_fields_confidence_check CHECK (((confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))),
    CONSTRAINT virtual_record_fields_value_type_check CHECK ((value_type = ANY (ARRAY['string'::text, 'number'::text, 'boolean'::text, 'date'::text, 'array'::text, 'object'::text, 'null'::text])))
);


--
-- Name: virtual_record_version_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.virtual_record_version_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    version_id uuid NOT NULL,
    field_key text NOT NULL,
    value jsonb,
    value_type text NOT NULL,
    confidence numeric,
    is_custom boolean DEFAULT false NOT NULL,
    source_evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT virtual_record_version_fields_confidence_check CHECK (((confidence IS NULL) OR ((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)))),
    CONSTRAINT virtual_record_version_fields_value_type_check CHECK ((value_type = ANY (ARRAY['string'::text, 'number'::text, 'boolean'::text, 'date'::text, 'array'::text, 'object'::text, 'null'::text])))
);


--
-- Name: virtual_record_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.virtual_record_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    virtual_record_id uuid NOT NULL,
    source_record_id uuid NOT NULL,
    version_number integer NOT NULL,
    document_type text,
    record_type text NOT NULL,
    status text NOT NULL,
    normalization_version integer,
    change_reason text DEFAULT 'projection_sync'::text NOT NULL,
    captured_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT virtual_record_versions_status_check CHECK ((status = ANY (ARRAY['raw'::text, 'normalized'::text, 'manual'::text, 'failed'::text]))),
    CONSTRAINT virtual_record_versions_version_number_check CHECK ((version_number > 0))
);


--
-- Name: virtual_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.virtual_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    file_id uuid NOT NULL,
    source_record_id uuid NOT NULL,
    document_type text,
    record_type text DEFAULT 'document_record'::text NOT NULL,
    status text DEFAULT 'raw'::text NOT NULL,
    normalization_version integer,
    is_current boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT virtual_records_status_check CHECK ((status = ANY (ARRAY['raw'::text, 'normalized'::text, 'manual'::text, 'failed'::text])))
);


--
-- Name: advanced_widgets advanced_widgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advanced_widgets
    ADD CONSTRAINT advanced_widgets_pkey PRIMARY KEY (id);


--
-- Name: ai_usage_events ai_usage_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_events
    ADD CONSTRAINT ai_usage_events_pkey PRIMARY KEY (id);


--
-- Name: context_summaries context_summaries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_summaries
    ADD CONSTRAINT context_summaries_pkey PRIMARY KEY (id);


--
-- Name: context_summaries context_summaries_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_summaries
    ADD CONSTRAINT context_summaries_user_id_key UNIQUE (user_id);


--
-- Name: dashboard_layouts dashboard_layouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_layouts
    ADD CONSTRAINT dashboard_layouts_pkey PRIMARY KEY (id);


--
-- Name: dashboard_layouts dashboard_layouts_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_layouts
    ADD CONSTRAINT dashboard_layouts_user_id_key UNIQUE (user_id);


--
-- Name: document_fields document_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_fields
    ADD CONSTRAINT document_fields_pkey PRIMARY KEY (id);


--
-- Name: document_processing_usage document_processing_usage_file_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_processing_usage
    ADD CONSTRAINT document_processing_usage_file_id_key UNIQUE (file_id);


--
-- Name: document_processing_usage document_processing_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_processing_usage
    ADD CONSTRAINT document_processing_usage_pkey PRIMARY KEY (id);


--
-- Name: error_events error_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_events
    ADD CONSTRAINT error_events_pkey PRIMARY KEY (id);


--
-- Name: error_groups error_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_groups
    ADD CONSTRAINT error_groups_pkey PRIMARY KEY (fingerprint);


--
-- Name: extractions extractions_file_id_attempt_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extractions
    ADD CONSTRAINT extractions_file_id_attempt_number_key UNIQUE (file_id, attempt_number);


--
-- Name: extractions extractions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.extractions
    ADD CONSTRAINT extractions_pkey PRIMARY KEY (id);


--
-- Name: files files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_pkey PRIMARY KEY (id);


--
-- Name: firm_admins firm_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firm_admins
    ADD CONSTRAINT firm_admins_pkey PRIMARY KEY (firm_id, user_id);


--
-- Name: firm_clients firm_clients_firm_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firm_clients
    ADD CONSTRAINT firm_clients_firm_id_user_id_key UNIQUE (firm_id, user_id);


--
-- Name: firm_clients firm_clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firm_clients
    ADD CONSTRAINT firm_clients_pkey PRIMARY KEY (id);


--
-- Name: firm_seat_purchases firm_seat_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firm_seat_purchases
    ADD CONSTRAINT firm_seat_purchases_pkey PRIMARY KEY (id);


--
-- Name: firm_seat_purchases firm_seat_purchases_provider_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firm_seat_purchases
    ADD CONSTRAINT firm_seat_purchases_provider_event_id_key UNIQUE (provider, event_id);


--
-- Name: firms firms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firms
    ADD CONSTRAINT firms_pkey PRIMARY KEY (id);


--
-- Name: firms firms_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firms
    ADD CONSTRAINT firms_slug_key UNIQUE (slug);


--
-- Name: folders folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_pkey PRIMARY KEY (id);


--
-- Name: fx_rates fx_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fx_rates
    ADD CONSTRAINT fx_rates_pkey PRIMARY KEY (rate_date, base_currency, target_currency);


--
-- Name: gift_codes gift_codes_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_codes
    ADD CONSTRAINT gift_codes_code_key UNIQUE (code);


--
-- Name: gift_codes gift_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_codes
    ADD CONSTRAINT gift_codes_pkey PRIMARY KEY (id);


--
-- Name: google_drive_connections google_drive_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_drive_connections
    ADD CONSTRAINT google_drive_connections_pkey PRIMARY KEY (user_id);


--
-- Name: partner_inquiries partner_inquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.partner_inquiries
    ADD CONSTRAINT partner_inquiries_pkey PRIMARY KEY (id);


--
-- Name: payment_obligations payment_obligations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_obligations
    ADD CONSTRAINT payment_obligations_pkey PRIMARY KEY (id);


--
-- Name: processed_webhook_events processed_webhook_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processed_webhook_events
    ADD CONSTRAINT processed_webhook_events_pkey PRIMARY KEY (provider, event_id);


--
-- Name: processing_jobs processing_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processing_jobs
    ADD CONSTRAINT processing_jobs_pkey PRIMARY KEY (id);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (bucket, key, window_start);


--
-- Name: record_attributes record_attributes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.record_attributes
    ADD CONSTRAINT record_attributes_pkey PRIMARY KEY (id);


--
-- Name: record_attributes record_attributes_record_id_field_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.record_attributes
    ADD CONSTRAINT record_attributes_record_id_field_key_key UNIQUE (record_id, field_key);


--
-- Name: record_revisions record_revisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.record_revisions
    ADD CONSTRAINT record_revisions_pkey PRIMARY KEY (id);


--
-- Name: record_revisions record_revisions_record_id_revision_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.record_revisions
    ADD CONSTRAINT record_revisions_record_id_revision_number_key UNIQUE (record_id, revision_number);


--
-- Name: records records_file_id_source_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.records
    ADD CONSTRAINT records_file_id_source_key_key UNIQUE (file_id, source_key);


--
-- Name: records records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.records
    ADD CONSTRAINT records_pkey PRIMARY KEY (id);


--
-- Name: report_assumptions report_assumptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_assumptions
    ADD CONSTRAINT report_assumptions_pkey PRIMARY KEY (id);


--
-- Name: report_assumptions report_assumptions_user_id_scope_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_assumptions
    ADD CONSTRAINT report_assumptions_user_id_scope_key UNIQUE (user_id, scope);


--
-- Name: report_export_usage report_export_usage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_export_usage
    ADD CONSTRAINT report_export_usage_pkey PRIMARY KEY (id);


--
-- Name: report_export_usage report_export_usage_user_id_period_start_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_export_usage
    ADD CONSTRAINT report_export_usage_user_id_period_start_key UNIQUE (user_id, period_start);


--
-- Name: smart_security_blocks smart_security_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smart_security_blocks
    ADD CONSTRAINT smart_security_blocks_pkey PRIMARY KEY (id);


--
-- Name: smart_security_decisions smart_security_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smart_security_decisions
    ADD CONSTRAINT smart_security_decisions_pkey PRIMARY KEY (id);


--
-- Name: smart_security_events smart_security_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.smart_security_events
    ADD CONSTRAINT smart_security_events_pkey PRIMARY KEY (id);


--
-- Name: studio_inquiries studio_inquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.studio_inquiries
    ADD CONSTRAINT studio_inquiries_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_email_key UNIQUE (email);


--
-- Name: subscriptions subscriptions_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_email_unique UNIQUE (email);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);


--
-- Name: system_admins system_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_admins
    ADD CONSTRAINT system_admins_pkey PRIMARY KEY (user_id);


--
-- Name: user_analytics_profile user_analytics_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_analytics_profile
    ADD CONSTRAINT user_analytics_profile_pkey PRIMARY KEY (id);


--
-- Name: user_analytics_profile user_analytics_profile_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_analytics_profile
    ADD CONSTRAINT user_analytics_profile_user_id_key UNIQUE (user_id);


--
-- Name: user_counter user_counter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_counter
    ADD CONSTRAINT user_counter_pkey PRIMARY KEY (id);


--
-- Name: user_referrals user_referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_referrals
    ADD CONSTRAINT user_referrals_pkey PRIMARY KEY (user_id);


--
-- Name: virtual_field_catalog virtual_field_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.virtual_field_catalog
    ADD CONSTRAINT virtual_field_catalog_pkey PRIMARY KEY (id);


--
-- Name: virtual_field_catalog virtual_field_catalog_user_id_field_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.virtual_field_catalog
    ADD CONSTRAINT virtual_field_catalog_user_id_field_key_key UNIQUE (user_id, field_key);


--
-- Name: virtual_record_fields virtual_record_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.virtual_record_fields
    ADD CONSTRAINT virtual_record_fields_pkey PRIMARY KEY (id);


--
-- Name: virtual_record_fields virtual_record_fields_virtual_record_id_field_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.virtual_record_fields
    ADD CONSTRAINT virtual_record_fields_virtual_record_id_field_key_key UNIQUE (virtual_record_id, field_key);


--
-- Name: virtual_record_version_fields virtual_record_version_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.virtual_record_version_fields
    ADD CONSTRAINT virtual_record_version_fields_pkey PRIMARY KEY (id);


--
-- Name: virtual_record_version_fields virtual_record_version_fields_version_id_field_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.virtual_record_version_fields
    ADD CONSTRAINT virtual_record_version_fields_version_id_field_key_key UNIQUE (version_id, field_key);


--
-- Name: virtual_record_versions virtual_record_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.virtual_record_versions
    ADD CONSTRAINT virtual_record_versions_pkey PRIMARY KEY (id);


--
-- Name: virtual_record_versions virtual_record_versions_virtual_record_id_version_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.virtual_record_versions
    ADD CONSTRAINT virtual_record_versions_virtual_record_id_version_number_key UNIQUE (virtual_record_id, version_number);


--
-- Name: virtual_records virtual_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.virtual_records
    ADD CONSTRAINT virtual_records_pkey PRIMARY KEY (id);


--
-- Name: virtual_records virtual_records_source_record_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.virtual_records
    ADD CONSTRAINT virtual_records_source_record_id_key UNIQUE (source_record_id);


--
-- Name: ai_usage_events_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_events_created_idx ON public.ai_usage_events USING btree (created_at DESC);


--
-- Name: ai_usage_events_file_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_events_file_idx ON public.ai_usage_events USING btree (file_id, created_at DESC);


--
-- Name: ai_usage_events_operation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_usage_events_operation_idx ON public.ai_usage_events USING btree (operation, created_at DESC);


--
-- Name: document_fields_file_source_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX document_fields_file_source_key_idx ON public.document_fields USING btree (file_id, source_key);


--
-- Name: document_fields_normalization_batch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_fields_normalization_batch_idx ON public.document_fields USING btree (file_id, normalization_batch_id, normalization_status);


--
-- Name: document_processing_usage_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_processing_usage_period_idx ON public.document_processing_usage USING btree (user_id, period_start, period_end);


--
-- Name: error_events_fingerprint_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX error_events_fingerprint_idx ON public.error_events USING btree (fingerprint);


--
-- Name: error_events_occurred_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX error_events_occurred_at_idx ON public.error_events USING btree (occurred_at DESC);


--
-- Name: error_events_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX error_events_user_id_idx ON public.error_events USING btree (user_id);


--
-- Name: extractions_file_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extractions_file_idx ON public.extractions USING btree (file_id);


--
-- Name: extractions_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX extractions_user_created_idx ON public.extractions USING btree (user_id, created_at DESC);


--
-- Name: files_normalization_batch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX files_normalization_batch_idx ON public.files USING btree (normalization_batch_id) WHERE (normalization_batch_id IS NOT NULL);


--
-- Name: files_sha256_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX files_sha256_idx ON public.files USING btree (sha256);


--
-- Name: files_source_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX files_source_provider_idx ON public.files USING btree (user_id, source_provider) WHERE (source_provider IS NOT NULL);


--
-- Name: files_upload_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX files_upload_status_idx ON public.files USING btree (upload_status);


--
-- Name: files_user_drive_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX files_user_drive_source_idx ON public.files USING btree (user_id, source_provider, source_file_id) WHERE ((source_provider IS NOT NULL) AND (source_file_id IS NOT NULL));


--
-- Name: firm_admins_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX firm_admins_user_idx ON public.firm_admins USING btree (user_id);


--
-- Name: firm_clients_firm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX firm_clients_firm_idx ON public.firm_clients USING btree (firm_id);


--
-- Name: firm_clients_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX firm_clients_user_idx ON public.firm_clients USING btree (user_id);


--
-- Name: firm_seat_purchases_firm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX firm_seat_purchases_firm_idx ON public.firm_seat_purchases USING btree (firm_id, created_at DESC);


--
-- Name: idx_advanced_widgets_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advanced_widgets_expires ON public.advanced_widgets USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_advanced_widgets_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_advanced_widgets_user_id ON public.advanced_widgets USING btree (user_id);


--
-- Name: idx_document_fields_income_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_fields_income_source ON public.document_fields USING btree (income_source) WHERE (income_source IS NOT NULL);


--
-- Name: idx_document_fields_is_recurring; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_fields_is_recurring ON public.document_fields USING btree (is_recurring) WHERE (is_recurring = true);


--
-- Name: idx_document_fields_merchant_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_fields_merchant_domain ON public.document_fields USING btree (merchant_domain) WHERE (merchant_domain IS NOT NULL);


--
-- Name: idx_document_fields_norm_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_fields_norm_status ON public.document_fields USING btree (normalization_status);


--
-- Name: idx_document_fields_period_end; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_document_fields_period_end ON public.document_fields USING btree (period_end);


--
-- Name: idx_fx_rates_date_currencies; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fx_rates_date_currencies ON public.fx_rates USING btree (rate_date, base_currency, target_currency);


--
-- Name: idx_payment_obligations_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_obligations_file ON public.payment_obligations USING btree (file_id);


--
-- Name: idx_payment_obligations_user_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_obligations_user_due ON public.payment_obligations USING btree (user_id, due_date);


--
-- Name: idx_rate_limits_window; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rate_limits_window ON public.rate_limits USING btree (window_start);


--
-- Name: idx_smart_security_blocks_subject; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_smart_security_blocks_subject ON public.smart_security_blocks USING btree (subject_type, subject_value, expires_at);


--
-- Name: idx_smart_security_decisions_fingerprint_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_smart_security_decisions_fingerprint_time ON public.smart_security_decisions USING btree (fingerprint, created_at DESC);


--
-- Name: idx_smart_security_decisions_path_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_smart_security_decisions_path_time ON public.smart_security_decisions USING btree (path, created_at DESC);


--
-- Name: idx_smart_security_decisions_user_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_smart_security_decisions_user_time ON public.smart_security_decisions USING btree (user_id, created_at DESC);


--
-- Name: idx_smart_security_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_smart_security_events_created_at ON public.smart_security_events USING btree (created_at DESC);


--
-- Name: idx_smart_security_events_fingerprint_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_smart_security_events_fingerprint_time ON public.smart_security_events USING btree (fingerprint, created_at DESC);


--
-- Name: idx_smart_security_events_type_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_smart_security_events_type_time ON public.smart_security_events USING btree (event_type, created_at DESC);


--
-- Name: idx_subscriptions_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_email ON public.subscriptions USING btree (email);


--
-- Name: idx_subscriptions_ls_sub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_ls_sub ON public.subscriptions USING btree (lemonsqueezy_subscription_id);


--
-- Name: idx_subscriptions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_user_id ON public.subscriptions USING btree (user_id);


--
-- Name: idx_virtual_field_catalog_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_virtual_field_catalog_user ON public.virtual_field_catalog USING btree (user_id);


--
-- Name: idx_virtual_record_fields_record; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_virtual_record_fields_record ON public.virtual_record_fields USING btree (virtual_record_id);


--
-- Name: idx_virtual_record_fields_user_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_virtual_record_fields_user_key ON public.virtual_record_fields USING btree (user_id, field_key);


--
-- Name: idx_virtual_record_version_fields_user_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_virtual_record_version_fields_user_key ON public.virtual_record_version_fields USING btree (user_id, field_key);


--
-- Name: idx_virtual_record_version_fields_version; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_virtual_record_version_fields_version ON public.virtual_record_version_fields USING btree (version_id);


--
-- Name: idx_virtual_record_versions_record; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_virtual_record_versions_record ON public.virtual_record_versions USING btree (virtual_record_id, version_number DESC);


--
-- Name: idx_virtual_record_versions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_virtual_record_versions_user ON public.virtual_record_versions USING btree (user_id, captured_at DESC);


--
-- Name: idx_virtual_records_file; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_virtual_records_file ON public.virtual_records USING btree (file_id);


--
-- Name: idx_virtual_records_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_virtual_records_type ON public.virtual_records USING btree (user_id, document_type, record_type);


--
-- Name: idx_virtual_records_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_virtual_records_user ON public.virtual_records USING btree (user_id);


--
-- Name: payment_obligations_record_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_obligations_record_idx ON public.payment_obligations USING btree (record_id);


--
-- Name: record_attributes_custom_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX record_attributes_custom_idx ON public.record_attributes USING btree (user_id, field_key) WHERE is_custom;


--
-- Name: record_attributes_record_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX record_attributes_record_idx ON public.record_attributes USING btree (record_id);


--
-- Name: record_attributes_user_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX record_attributes_user_key_idx ON public.record_attributes USING btree (user_id, field_key);


--
-- Name: record_revisions_overlay_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX record_revisions_overlay_idx ON public.record_revisions USING btree (record_id, target_kind, target, revision_number DESC) WHERE (change_kind = 'user_edit'::text);


--
-- Name: record_revisions_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX record_revisions_user_idx ON public.record_revisions USING btree (user_id, created_at DESC);


--
-- Name: records_extraction_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX records_extraction_idx ON public.records USING btree (extraction_id);


--
-- Name: records_file_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX records_file_idx ON public.records USING btree (file_id);


--
-- Name: records_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX records_parent_idx ON public.records USING btree (parent_record_id);


--
-- Name: records_user_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX records_user_category_idx ON public.records USING btree (user_id, category) WHERE (parent_record_id IS NULL);


--
-- Name: records_user_direction_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX records_user_direction_date_idx ON public.records USING btree (user_id, direction, occurred_on DESC) WHERE (parent_record_id IS NULL);


--
-- Name: records_user_review_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX records_user_review_idx ON public.records USING btree (user_id, needs_review) WHERE needs_review;


--
-- Name: records_user_toplevel_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX records_user_toplevel_date_idx ON public.records USING btree (user_id, occurred_on DESC) WHERE (parent_record_id IS NULL);


--
-- Name: records_user_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX records_user_type_idx ON public.records USING btree (user_id, record_type);


--
-- Name: report_export_usage_period_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX report_export_usage_period_idx ON public.report_export_usage USING btree (user_id, period_start, period_end);


--
-- Name: uidx_payment_obligations_file_due_check; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uidx_payment_obligations_file_due_check ON public.payment_obligations USING btree (file_id, due_date, COALESCE(check_number, ''::text));


--
-- Name: files files_storage_quota_enforcement; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER files_storage_quota_enforcement BEFORE INSERT OR UPDATE OF file_size, user_id ON public.files FOR EACH ROW EXECUTE FUNCTION public.avint_enforce_file_storage_quota();


--
-- Name: payment_obligations trg_payment_obligations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payment_obligations_updated_at BEFORE UPDATE ON public.payment_obligations FOR EACH ROW EXECUTE FUNCTION public.update_payment_obligations_updated_at();


--
-- Name: virtual_record_fields virtual_record_fields_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER virtual_record_fields_updated_at BEFORE UPDATE ON public.virtual_record_fields FOR EACH ROW EXECUTE FUNCTION public.set_virtual_updated_at();


--
-- Name: virtual_records virtual_records_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER virtual_records_updated_at BEFORE UPDATE ON public.virtual_records FOR EACH ROW EXECUTE FUNCTION public.set_virtual_updated_at();


--
-- Name: advanced_widgets advanced_widgets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.advanced_widgets
    ADD CONSTRAINT advanced_widgets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: ai_usage_events ai_usage_events_document_field_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_events
    ADD CONSTRAINT ai_usage_events_document_field_id_fkey FOREIGN KEY (document_field_id) REFERENCES public.document_fields(id) ON DELETE SET NULL;


--
-- Name: ai_usage_events ai_usage_events_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_events
    ADD CONSTRAINT ai_usage_events_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE SET NULL;


--
-- Name: ai_usage_events ai_usage_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_events
    ADD CONSTRAINT ai_usage_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: context_summaries context_summaries_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.context_summaries
    ADD CONSTRAINT context_summaries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: dashboard_layouts dashboard_layouts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dashboard_layouts
    ADD CONSTRAINT dashboard_layouts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: document_fields document_fields_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_fields
    ADD CONSTRAINT document_fields_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: document_processing_usage document_processing_usage_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_processing_usage
    ADD CONSTRAINT document_processing_usage_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: document_processing_usage document_processing_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_processing_usage
    ADD CONSTRAINT document_processing_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: error_events error_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_events
    ADD CONSTRAINT error_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: error_groups error_groups_action_taken_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_groups
    ADD CONSTRAINT error_groups_action_taken_by_fkey FOREIGN KEY (action_taken_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: error_groups error_groups_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_groups
    ADD CONSTRAINT error_groups_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: files files_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE SET NULL;


--
-- Name: files files_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.files
    ADD CONSTRAINT files_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: firm_admins firm_admins_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firm_admins
    ADD CONSTRAINT firm_admins_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firms(id) ON DELETE CASCADE;


--
-- Name: firm_admins firm_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firm_admins
    ADD CONSTRAINT firm_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: firm_clients firm_clients_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firm_clients
    ADD CONSTRAINT firm_clients_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firms(id) ON DELETE CASCADE;


--
-- Name: firm_clients firm_clients_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firm_clients
    ADD CONSTRAINT firm_clients_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: firm_seat_purchases firm_seat_purchases_firm_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.firm_seat_purchases
    ADD CONSTRAINT firm_seat_purchases_firm_id_fkey FOREIGN KEY (firm_id) REFERENCES public.firms(id) ON DELETE RESTRICT;


--
-- Name: folders folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.folders(id) ON DELETE CASCADE;


--
-- Name: folders folders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: gift_codes gift_codes_issued_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gift_codes
    ADD CONSTRAINT gift_codes_issued_by_user_id_fkey FOREIGN KEY (issued_by_user_id) REFERENCES auth.users(id);


--
-- Name: google_drive_connections google_drive_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_drive_connections
    ADD CONSTRAINT google_drive_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: payment_obligations payment_obligations_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_obligations
    ADD CONSTRAINT payment_obligations_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: payment_obligations payment_obligations_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_obligations
    ADD CONSTRAINT payment_obligations_record_id_fkey FOREIGN KEY (record_id) REFERENCES public.records(id) ON DELETE SET NULL;


--
-- Name: payment_obligations payment_obligations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_obligations
    ADD CONSTRAINT payment_obligations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: processing_jobs processing_jobs_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processing_jobs
    ADD CONSTRAINT processing_jobs_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: record_attributes record_attributes_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.record_attributes
    ADD CONSTRAINT record_attributes_record_id_fkey FOREIGN KEY (record_id) REFERENCES public.records(id) ON DELETE CASCADE;


--
-- Name: record_revisions record_revisions_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.record_revisions
    ADD CONSTRAINT record_revisions_record_id_fkey FOREIGN KEY (record_id) REFERENCES public.records(id) ON DELETE CASCADE;


--
-- Name: records records_extraction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.records
    ADD CONSTRAINT records_extraction_id_fkey FOREIGN KEY (extraction_id) REFERENCES public.extractions(id) ON DELETE CASCADE;


--
-- Name: records records_parent_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.records
    ADD CONSTRAINT records_parent_record_id_fkey FOREIGN KEY (parent_record_id) REFERENCES public.records(id) ON DELETE CASCADE;


--
-- Name: report_assumptions report_assumptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_assumptions
    ADD CONSTRAINT report_assumptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: report_export_usage report_export_usage_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_export_usage
    ADD CONSTRAINT report_export_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);


--
-- Name: system_admins system_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_admins
    ADD CONSTRAINT system_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_referrals user_referrals_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_referrals
    ADD CONSTRAINT user_referrals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: virtual_field_catalog virtual_field_catalog_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.virtual_field_catalog
    ADD CONSTRAINT virtual_field_catalog_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: virtual_record_fields virtual_record_fields_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.virtual_record_fields
    ADD CONSTRAINT virtual_record_fields_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: virtual_record_fields virtual_record_fields_virtual_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.virtual_record_fields
    ADD CONSTRAINT virtual_record_fields_virtual_record_id_fkey FOREIGN KEY (virtual_record_id) REFERENCES public.virtual_records(id) ON DELETE CASCADE;


--
-- Name: virtual_record_version_fields virtual_record_version_fields_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.virtual_record_version_fields
    ADD CONSTRAINT virtual_record_version_fields_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: virtual_record_version_fields virtual_record_version_fields_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.virtual_record_version_fields
    ADD CONSTRAINT virtual_record_version_fields_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.virtual_record_versions(id) ON DELETE CASCADE;


--
-- Name: virtual_record_versions virtual_record_versions_source_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.virtual_record_versions
    ADD CONSTRAINT virtual_record_versions_source_record_id_fkey FOREIGN KEY (source_record_id) REFERENCES public.document_fields(id) ON DELETE CASCADE;


--
-- Name: virtual_record_versions virtual_record_versions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.virtual_record_versions
    ADD CONSTRAINT virtual_record_versions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: virtual_record_versions virtual_record_versions_virtual_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.virtual_record_versions
    ADD CONSTRAINT virtual_record_versions_virtual_record_id_fkey FOREIGN KEY (virtual_record_id) REFERENCES public.virtual_records(id) ON DELETE CASCADE;


--
-- Name: virtual_records virtual_records_file_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.virtual_records
    ADD CONSTRAINT virtual_records_file_id_fkey FOREIGN KEY (file_id) REFERENCES public.files(id) ON DELETE CASCADE;


--
-- Name: virtual_records virtual_records_source_record_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.virtual_records
    ADD CONSTRAINT virtual_records_source_record_id_fkey FOREIGN KEY (source_record_id) REFERENCES public.document_fields(id) ON DELETE CASCADE;


--
-- Name: virtual_records virtual_records_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.virtual_records
    ADD CONSTRAINT virtual_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: user_counter Anyone can read counter; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can read counter" ON public.user_counter FOR SELECT TO authenticated, anon USING (true);


--
-- Name: system_admins Existing system admins can read allowlist; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Existing system admins can read allowlist" ON public.system_admins FOR SELECT USING (public.is_system_admin());


--
-- Name: document_fields Service role can manage document_fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage document_fields" ON public.document_fields TO service_role USING (true) WITH CHECK (true);


--
-- Name: files Service role can manage files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage files" ON public.files TO service_role USING (true) WITH CHECK (true);


--
-- Name: processing_jobs Service role can manage processing_jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage processing_jobs" ON public.processing_jobs TO service_role USING (true) WITH CHECK (true);


--
-- Name: smart_security_blocks Service role can manage smart_security_blocks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage smart_security_blocks" ON public.smart_security_blocks USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: smart_security_decisions Service role can manage smart_security_decisions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage smart_security_decisions" ON public.smart_security_decisions USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: smart_security_events Service role can manage smart_security_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage smart_security_events" ON public.smart_security_events USING ((auth.role() = 'service_role'::text)) WITH CHECK ((auth.role() = 'service_role'::text));


--
-- Name: subscriptions Service role can manage subscriptions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage subscriptions" ON public.subscriptions TO service_role USING (true) WITH CHECK (true);


--
-- Name: user_counter Service role can update counter; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can update counter" ON public.user_counter TO service_role USING (true) WITH CHECK (true);


--
-- Name: context_summaries Service role can upsert summaries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can upsert summaries" ON public.context_summaries USING (true) WITH CHECK (true);


--
-- Name: error_events System admins can read error events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System admins can read error events" ON public.error_events FOR SELECT USING (public.is_system_admin());


--
-- Name: error_groups System admins can read error groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "System admins can read error groups" ON public.error_groups FOR SELECT USING (public.is_system_admin());


--
-- Name: google_drive_connections Users can delete their Google Drive connection; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their Google Drive connection" ON public.google_drive_connections FOR DELETE USING ((auth.uid() = user_id));


--
-- Name: files Users can delete their own files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete their own files" ON public.files FOR DELETE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: document_fields Users can insert own document fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own document fields" ON public.document_fields FOR INSERT WITH CHECK ((file_id IN ( SELECT files.id
   FROM public.files
  WHERE (files.user_id = auth.uid()))));


--
-- Name: payment_obligations Users can insert own obligations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own obligations" ON public.payment_obligations FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: files Users can insert their own files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own files" ON public.files FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: processing_jobs Users can insert their own jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own jobs" ON public.processing_jobs FOR INSERT TO authenticated WITH CHECK ((file_id IN ( SELECT files.id
   FROM public.files
  WHERE (files.user_id = auth.uid()))));


--
-- Name: advanced_widgets Users can manage own advanced widgets; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage own advanced widgets" ON public.advanced_widgets USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: folders Users can manage their own folders; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own folders" ON public.folders TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: dashboard_layouts Users can manage their own layout; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can manage their own layout" ON public.dashboard_layouts TO authenticated USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));


--
-- Name: context_summaries Users can read own summary; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own summary" ON public.context_summaries FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: virtual_field_catalog Users can read own virtual field catalog; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own virtual field catalog" ON public.virtual_field_catalog FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: virtual_record_fields Users can read own virtual record fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own virtual record fields" ON public.virtual_record_fields FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: virtual_record_version_fields Users can read own virtual record version fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own virtual record version fields" ON public.virtual_record_version_fields FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: virtual_record_versions Users can read own virtual record versions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own virtual record versions" ON public.virtual_record_versions FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: virtual_records Users can read own virtual records; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own virtual records" ON public.virtual_records FOR SELECT USING ((user_id = auth.uid()));


--
-- Name: document_fields Users can read their own document fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read their own document fields" ON public.document_fields FOR SELECT TO authenticated USING ((file_id IN ( SELECT files.id
   FROM public.files
  WHERE (files.user_id = auth.uid()))));


--
-- Name: files Users can read their own files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read their own files" ON public.files FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: processing_jobs Users can read their own jobs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read their own jobs" ON public.processing_jobs FOR SELECT TO authenticated USING ((file_id IN ( SELECT files.id
   FROM public.files
  WHERE (files.user_id = auth.uid()))));


--
-- Name: subscriptions Users can read their own subscription; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read their own subscription" ON public.subscriptions FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: payment_obligations Users can select own obligations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can select own obligations" ON public.payment_obligations FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: document_fields Users can update own document fields; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own document fields" ON public.document_fields FOR UPDATE USING ((file_id IN ( SELECT files.id
   FROM public.files
  WHERE (files.user_id = auth.uid()))));


--
-- Name: payment_obligations Users can update own obligations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own obligations" ON public.payment_obligations FOR UPDATE USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: files Users can update their own files; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own files" ON public.files FOR UPDATE TO authenticated USING ((user_id = auth.uid()));


--
-- Name: google_drive_connections Users can view their Google Drive connection; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view their Google Drive connection" ON public.google_drive_connections FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: user_analytics_profile Users own their analytics profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users own their analytics profile" ON public.user_analytics_profile USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: advanced_widgets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.advanced_widgets ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_usage_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

--
-- Name: context_summaries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.context_summaries ENABLE ROW LEVEL SECURITY;

--
-- Name: dashboard_layouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dashboard_layouts ENABLE ROW LEVEL SECURITY;

--
-- Name: document_fields; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_fields ENABLE ROW LEVEL SECURITY;

--
-- Name: document_processing_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.document_processing_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: error_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.error_events ENABLE ROW LEVEL SECURITY;

--
-- Name: error_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.error_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: extractions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.extractions ENABLE ROW LEVEL SECURITY;

--
-- Name: files; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

--
-- Name: firm_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.firm_admins ENABLE ROW LEVEL SECURITY;

--
-- Name: firm_admins firm_admins_select_linked_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY firm_admins_select_linked_admin ON public.firm_admins FOR SELECT TO authenticated USING (public.is_firm_admin(firm_id));


--
-- Name: firm_clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.firm_clients ENABLE ROW LEVEL SECURITY;

--
-- Name: firm_clients firm_clients_select_self_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY firm_clients_select_self_or_admin ON public.firm_clients FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_firm_admin(firm_id)));


--
-- Name: firm_seat_purchases; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.firm_seat_purchases ENABLE ROW LEVEL SECURITY;

--
-- Name: firms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.firms ENABLE ROW LEVEL SECURITY;

--
-- Name: firms firms_select_linked_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY firms_select_linked_admin ON public.firms FOR SELECT TO authenticated USING (public.is_firm_admin(id));


--
-- Name: folders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

--
-- Name: fx_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: fx_rates fx_rates readable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fx_rates readable by authenticated users" ON public.fx_rates FOR SELECT TO authenticated USING (true);


--
-- Name: gift_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gift_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: google_drive_connections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.google_drive_connections ENABLE ROW LEVEL SECURITY;

--
-- Name: user_referrals insert own referral; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insert own referral" ON public.user_referrals FOR INSERT WITH CHECK ((auth.uid() = user_id));


--
-- Name: extractions p_extractions_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_extractions_owner_read ON public.extractions FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: record_attributes p_record_attributes_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_record_attributes_owner_read ON public.record_attributes FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: record_revisions p_record_revisions_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_record_revisions_owner_read ON public.record_revisions FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: records p_records_owner_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY p_records_owner_read ON public.records FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: partner_inquiries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.partner_inquiries ENABLE ROW LEVEL SECURITY;

--
-- Name: partner_inquiries partner_inquiries_anon_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY partner_inquiries_anon_insert ON public.partner_inquiries FOR INSERT TO anon WITH CHECK (true);


--
-- Name: partner_inquiries partner_inquiries_service_role_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY partner_inquiries_service_role_select ON public.partner_inquiries FOR SELECT TO service_role USING (true);


--
-- Name: payment_obligations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_obligations ENABLE ROW LEVEL SECURITY;

--
-- Name: processed_webhook_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.processed_webhook_events ENABLE ROW LEVEL SECURITY;

--
-- Name: processing_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.processing_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: rate_limits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: user_referrals read own referral; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "read own referral" ON public.user_referrals FOR SELECT USING ((auth.uid() = user_id));


--
-- Name: record_attributes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.record_attributes ENABLE ROW LEVEL SECURITY;

--
-- Name: record_revisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.record_revisions ENABLE ROW LEVEL SECURITY;

--
-- Name: records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;

--
-- Name: report_assumptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.report_assumptions ENABLE ROW LEVEL SECURITY;

--
-- Name: report_assumptions report_assumptions_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY report_assumptions_insert_own ON public.report_assumptions FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: report_assumptions report_assumptions_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY report_assumptions_select_own ON public.report_assumptions FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: report_assumptions report_assumptions_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY report_assumptions_update_own ON public.report_assumptions FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: report_export_usage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.report_export_usage ENABLE ROW LEVEL SECURITY;

--
-- Name: retired_api_keys_20260823; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.retired_api_keys_20260823 ENABLE ROW LEVEL SECURITY;

--
-- Name: smart_security_blocks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.smart_security_blocks ENABLE ROW LEVEL SECURITY;

--
-- Name: smart_security_decisions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.smart_security_decisions ENABLE ROW LEVEL SECURITY;

--
-- Name: smart_security_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.smart_security_events ENABLE ROW LEVEL SECURITY;

--
-- Name: studio_inquiries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.studio_inquiries ENABLE ROW LEVEL SECURITY;

--
-- Name: studio_inquiries studio_inquiries_anon_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY studio_inquiries_anon_insert ON public.studio_inquiries FOR INSERT TO anon WITH CHECK (true);


--
-- Name: studio_inquiries studio_inquiries_service_role_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY studio_inquiries_service_role_select ON public.studio_inquiries FOR SELECT TO service_role USING (true);


--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: system_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.system_admins ENABLE ROW LEVEL SECURITY;

--
-- Name: user_analytics_profile; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_analytics_profile ENABLE ROW LEVEL SECURITY;

--
-- Name: user_counter; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_counter ENABLE ROW LEVEL SECURITY;

--
-- Name: user_referrals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_referrals ENABLE ROW LEVEL SECURITY;

--
-- Name: virtual_field_catalog; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.virtual_field_catalog ENABLE ROW LEVEL SECURITY;

--
-- Name: virtual_record_fields; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.virtual_record_fields ENABLE ROW LEVEL SECURITY;

--
-- Name: virtual_record_version_fields; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.virtual_record_version_fields ENABLE ROW LEVEL SECURITY;

--
-- Name: virtual_record_versions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.virtual_record_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: virtual_records; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.virtual_records ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--



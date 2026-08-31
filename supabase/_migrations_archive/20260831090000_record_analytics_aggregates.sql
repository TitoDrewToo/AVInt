-- Parent-only, database-side aggregates for analytics consumers.
-- This migration is parity-only until explicitly applied.

create or replace function public.get_record_summary(
  p_user_id uuid,
  p_from date default null,
  p_to date default null
)
returns table (
  record_count bigint,
  inflow_count bigint,
  outflow_count bigint,
  neutral_count bigint,
  total_inflow numeric,
  total_outflow numeric,
  needs_review_count bigint,
  months_tracked bigint
)
language sql
stable
security definer
set search_path = public
as $$
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

create or replace function public.get_record_amounts_by_direction(
  p_user_id uuid,
  p_from date default null,
  p_to date default null
)
returns table (direction text, record_count bigint, amount numeric)
language sql stable security definer set search_path = public
as $$
  select r.direction, count(*)::bigint, coalesce(sum(r.amount), 0)
  from public.records r
  where r.user_id = p_user_id and r.parent_record_id is null
    and (p_from is null or r.occurred_on >= p_from)
    and (p_to is null or r.occurred_on <= p_to)
  group by r.direction
  order by r.direction;
$$;

create or replace function public.get_record_amounts_by_month(
  p_user_id uuid,
  p_from date default null,
  p_to date default null
)
returns table (period_start date, direction text, record_count bigint, amount numeric)
language sql stable security definer set search_path = public
as $$
  select date_trunc('month', r.occurred_on)::date, r.direction, count(*)::bigint, coalesce(sum(r.amount), 0)
  from public.records r
  where r.user_id = p_user_id and r.parent_record_id is null and r.occurred_on is not null
    and (p_from is null or r.occurred_on >= p_from)
    and (p_to is null or r.occurred_on <= p_to)
  group by 1, r.direction
  order by 1, r.direction;
$$;

create or replace function public.get_record_amounts_by_category(
  p_user_id uuid,
  p_from date default null,
  p_to date default null,
  p_limit integer default 25
)
returns table (category text, direction text, record_count bigint, amount numeric)
language sql stable security definer set search_path = public
as $$
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

create or replace function public.get_record_amounts_by_counterparty(
  p_user_id uuid,
  p_from date default null,
  p_to date default null,
  p_limit integer default 25
)
returns table (counterparty text, direction text, record_count bigint, amount numeric)
language sql stable security definer set search_path = public
as $$
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

revoke all on function public.get_record_summary(uuid, date, date) from public, anon, authenticated;
revoke all on function public.get_record_amounts_by_direction(uuid, date, date) from public, anon, authenticated;
revoke all on function public.get_record_amounts_by_month(uuid, date, date) from public, anon, authenticated;
revoke all on function public.get_record_amounts_by_category(uuid, date, date, integer) from public, anon, authenticated;
revoke all on function public.get_record_amounts_by_counterparty(uuid, date, date, integer) from public, anon, authenticated;
grant execute on function public.get_record_summary(uuid, date, date) to service_role;
grant execute on function public.get_record_amounts_by_direction(uuid, date, date) to service_role;
grant execute on function public.get_record_amounts_by_month(uuid, date, date) to service_role;
grant execute on function public.get_record_amounts_by_category(uuid, date, date, integer) to service_role;
grant execute on function public.get_record_amounts_by_counterparty(uuid, date, date, integer) to service_role;

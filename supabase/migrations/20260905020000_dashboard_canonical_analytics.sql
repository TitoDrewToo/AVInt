-- Bring Smart Dashboard onto the canonical record/dataset era.
-- Existing aggregate signatures remain for compatibility, but now omit excluded rows.

create or replace function public.get_record_summary(p_user_id uuid, p_from date default null, p_to date default null)
returns table(record_count bigint, inflow_count bigint, outflow_count bigint, neutral_count bigint, total_inflow numeric, total_outflow numeric, needs_review_count bigint, months_tracked bigint)
language sql stable security definer set search_path = public as $$
  with scoped as (
    select * from public.records
    where user_id = p_user_id and parent_record_id is null and excluded_at is null
      and (p_from is null or occurred_on >= p_from) and (p_to is null or occurred_on <= p_to)
  )
  select count(*)::bigint,
    count(*) filter (where direction = 'inflow')::bigint,
    count(*) filter (where direction = 'outflow')::bigint,
    count(*) filter (where direction = 'neutral')::bigint,
    coalesce(sum(amount) filter (where direction = 'inflow'), 0),
    coalesce(sum(amount) filter (where direction = 'outflow'), 0),
    count(*) filter (where needs_review)::bigint,
    count(distinct date_trunc('month', occurred_on)) filter (where occurred_on is not null)::bigint
  from scoped;
$$;

create or replace function public.get_dashboard_currencies(p_user_id uuid, p_from date default null, p_to date default null)
returns table(currency text, record_count bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(upper(trim(r.currency)), ''), 'UNSPECIFIED'), count(*)::bigint
  from public.records r
  where r.user_id = p_user_id and r.parent_record_id is null and r.excluded_at is null
    and (p_from is null or r.occurred_on >= p_from) and (p_to is null or r.occurred_on <= p_to)
  group by 1 order by count(*) desc, 1;
$$;

create or replace function public.get_dashboard_record_analytics(p_user_id uuid, p_from date default null, p_to date default null, p_currency text default null)
returns table(bucket_kind text, bucket_key text, direction text, record_count bigint, amount numeric)
language sql stable security definer set search_path = public as $$
  with scoped as (
    select * from public.records r
    where r.user_id = p_user_id and r.parent_record_id is null and r.excluded_at is null
      and (p_from is null or r.occurred_on >= p_from) and (p_to is null or r.occurred_on <= p_to)
      and (p_currency is null or coalesce(nullif(upper(trim(r.currency)), ''), 'UNSPECIFIED') = upper(p_currency))
  ), buckets as (
    select 'summary'::text, 'all'::text, direction, count(*)::bigint, coalesce(sum(amount), 0) from scoped group by direction
    union all
    select 'category', coalesce(nullif(trim(category), ''), 'Uncategorized'), direction, count(*)::bigint, coalesce(sum(amount), 0) from scoped group by 2, direction
    union all
    select 'month', to_char(date_trunc('month', occurred_on), 'YYYY-MM'), direction, count(*)::bigint, coalesce(sum(amount), 0) from scoped where occurred_on is not null group by 2, direction
    union all
    select 'counterparty', coalesce(nullif(trim(coalesce(counterparty_normalized, counterparty)), ''), 'Unattributed'), direction, count(*)::bigint, coalesce(sum(amount), 0) from scoped group by 2, direction
  )
  select * from buckets order by bucket_kind, amount desc, bucket_key, direction;
$$;

create or replace function public.get_dashboard_attribute_analytics(p_user_id uuid, p_field_keys text[], p_from date default null, p_to date default null, p_currency text default null)
returns table(field_key text, value_text text, record_count bigint, numeric_total numeric)
language sql stable security definer set search_path = public as $$
  select a.field_key,
    case when a.value_type in ('string', 'date', 'boolean') then trim(both '"' from a.value::text) else null end,
    count(*)::bigint,
    sum(coalesce(a.value_numeric, r.amount))
  from public.record_attributes a
  join public.records r on r.id = a.record_id and r.user_id = a.user_id
  where a.user_id = p_user_id and r.parent_record_id is null and r.excluded_at is null
    and a.field_key = any(p_field_keys)
    and (p_from is null or r.occurred_on >= p_from) and (p_to is null or r.occurred_on <= p_to)
    and (p_currency is null or coalesce(nullif(upper(trim(r.currency)), ''), 'UNSPECIFIED') = upper(p_currency))
  group by a.field_key, 2 order by a.field_key, count(*) desc, 2;
$$;

revoke all on function public.get_dashboard_currencies(uuid, date, date) from public, anon, authenticated;
revoke all on function public.get_dashboard_record_analytics(uuid, date, date, text) from public, anon, authenticated;
revoke all on function public.get_dashboard_attribute_analytics(uuid, text[], date, date, text) from public, anon, authenticated;
grant execute on function public.get_dashboard_currencies(uuid, date, date) to service_role;
grant execute on function public.get_dashboard_record_analytics(uuid, date, date, text) to service_role;
grant execute on function public.get_dashboard_attribute_analytics(uuid, text[], date, date, text) to service_role;

-- These legacy aggregates are no longer called by browser code. Restrict the
-- UUID-parameterized SECURITY DEFINER surface to trusted server functions.
revoke all on function public.get_record_summary(uuid, date, date) from public, anon, authenticated;
revoke all on function public.get_record_amounts_by_category(uuid, date, date, integer) from public, anon, authenticated;
revoke all on function public.get_record_amounts_by_counterparty(uuid, date, date, integer) from public, anon, authenticated;
revoke all on function public.get_record_amounts_by_direction(uuid, date, date) from public, anon, authenticated;
revoke all on function public.get_record_amounts_by_month(uuid, date, date) from public, anon, authenticated;
grant execute on function public.get_record_summary(uuid, date, date) to service_role;
grant execute on function public.get_record_amounts_by_category(uuid, date, date, integer) to service_role;
grant execute on function public.get_record_amounts_by_counterparty(uuid, date, date, integer) to service_role;
grant execute on function public.get_record_amounts_by_direction(uuid, date, date) to service_role;
grant execute on function public.get_record_amounts_by_month(uuid, date, date) to service_role;

create table if not exists public.dashboard_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  kind text not null default 'custom' check (kind in ('personal', 'business', 'custom')),
  layout jsonb not null default '{"widgets":[],"gridLayout":[]}'::jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);
alter table public.dashboard_pages enable row level security;
create policy "Users can manage own dashboard pages" on public.dashboard_pages
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

insert into public.dashboard_pages (user_id, name, slug, kind, layout, position)
select dl.user_id, 'Personal', 'personal', 'personal', dl.layout, 0
from public.dashboard_layouts dl
on conflict (user_id, slug) do nothing;

alter table public.advanced_widgets add column if not exists page_id uuid references public.dashboard_pages(id) on delete cascade;
update public.advanced_widgets aw set page_id = p.id
from public.dashboard_pages p where p.user_id = aw.user_id and p.slug = 'personal' and aw.page_id is null;
create index if not exists advanced_widgets_page_id_idx on public.advanced_widgets(page_id);

-- Keep account deletion atomic now that pages are durable user data.
create or replace function public.delete_user_data(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_paths text[]; v_records_count int; v_extractions_count int; v_datasets_count int;
  v_pj_count int; v_po_count int; v_files_count int; v_folders_count int;
  v_aw_count int; v_dp_count int; v_dl_count int; v_cs_count int; v_ra_count int;
  v_rd_count int; v_uap_count int; v_subs_count int;
begin
  select coalesce(array_agg(storage_path) filter (where storage_path is not null), '{}') into v_paths
    from public.files where user_id = p_user_id;
  select count(*) into v_records_count from public.records where user_id = p_user_id;
  select count(*) into v_extractions_count from public.extractions where user_id = p_user_id;
  select count(*) into v_datasets_count from public.datasets where user_id = p_user_id;

  with d as (delete from public.processing_jobs where file_id in (select id from public.files where user_id = p_user_id) returning 1)
    select count(*) into v_pj_count from d;
  with d as (delete from public.payment_obligations where user_id = p_user_id returning 1)
    select count(*) into v_po_count from d;
  with d as (delete from public.report_definitions where user_id = p_user_id returning 1)
    select count(*) into v_rd_count from d;
  with d as (delete from public.files where user_id = p_user_id returning 1)
    select count(*) into v_files_count from d;
  with d as (delete from public.folders where user_id = p_user_id returning 1)
    select count(*) into v_folders_count from d;
  with d as (delete from public.advanced_widgets where user_id = p_user_id returning 1)
    select count(*) into v_aw_count from d;
  with d as (delete from public.dashboard_pages where user_id = p_user_id returning 1)
    select count(*) into v_dp_count from d;
  with d as (delete from public.dashboard_layouts where user_id = p_user_id returning 1)
    select count(*) into v_dl_count from d;
  with d as (delete from public.context_summaries where user_id = p_user_id returning 1)
    select count(*) into v_cs_count from d;
  with d as (delete from public.report_assumptions where user_id = p_user_id returning 1)
    select count(*) into v_ra_count from d;
  with d as (delete from public.user_analytics_profile where user_id = p_user_id returning 1)
    select count(*) into v_uap_count from d;

  update public.subscriptions set user_id = null, email = null where user_id = p_user_id;
  get diagnostics v_subs_count = row_count;
  return jsonb_build_object('storage_paths', v_paths, 'counts', jsonb_build_object(
    'document_fields', 0, 'records', v_records_count, 'extractions', v_extractions_count,
    'datasets', v_datasets_count, 'processing_jobs', v_pj_count, 'payment_obligations', v_po_count,
    'report_definitions', v_rd_count, 'files', v_files_count, 'folders', v_folders_count,
    'advanced_widgets', v_aw_count, 'dashboard_pages', v_dp_count, 'dashboard_layouts', v_dl_count,
    'context_summaries', v_cs_count, 'report_assumptions', v_ra_count,
    'user_analytics_profile', v_uap_count, 'subscriptions_anonymized', v_subs_count));
end;
$$;
revoke all on function public.delete_user_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_data(uuid) to service_role;

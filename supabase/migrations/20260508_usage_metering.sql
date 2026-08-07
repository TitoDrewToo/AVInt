-- Central usage meters for document processing and report generation.
-- The application supplies the centralized tier window/limit; these RPCs make
-- each claim atomic so concurrent requests cannot bypass a limit.

create table if not exists public.document_processing_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  processed_at timestamptz not null default now(),
  unique (file_id)
);

create index if not exists document_processing_usage_period_idx
  on public.document_processing_usage (user_id, period_start, period_end);

create table if not exists public.report_export_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_key text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  exported_at timestamptz not null default now(),
  unique (user_id, period_start)
);

create index if not exists report_export_usage_period_idx
  on public.report_export_usage (user_id, period_start, period_end);

alter table public.document_processing_usage enable row level security;
alter table public.report_export_usage enable row level security;

create or replace function public.avint_claim_document_processing(
  p_user_id uuid,
  p_file_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_limit integer
)
returns table(allowed boolean, already_claimed boolean, used_count integer, limit_count integer)
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
    select count(*)::integer into current_count
    from public.document_processing_usage
    where user_id = p_user_id and period_start = p_period_start;
    return query select true, true, current_count, p_limit;
    return;
  end if;

  select count(*)::integer into current_count
  from public.document_processing_usage
  where user_id = p_user_id and period_start = p_period_start;

  if current_count >= p_limit then
    return query select false, false, current_count, p_limit;
    return;
  end if;

  insert into public.document_processing_usage (user_id, file_id, period_start, period_end)
  values (p_user_id, p_file_id, p_period_start, p_period_end);

  return query select true, false, current_count + 1, p_limit;
end;
$$;

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
set search_path = public
as $$
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

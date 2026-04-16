create table if not exists public.report_assumptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('business_expense')),
  filing_context text not null check (filing_context in ('self_employed', 'employed')),
  federal_marginal_rate numeric(5,2) not null default 22,
  state_marginal_rate numeric(5,2) not null default 0,
  include_self_employment_tax boolean not null default true,
  self_employment_tax_rate numeric(5,2) not null default 15.3,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, scope)
);

alter table public.report_assumptions enable row level security;

create policy "report_assumptions_select_own"
on public.report_assumptions
for select
to authenticated
using (auth.uid() = user_id);

create policy "report_assumptions_insert_own"
on public.report_assumptions
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "report_assumptions_update_own"
on public.report_assumptions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- user_analytics_profile: persistent per-user financial fingerprint
-- Written to by generate-advanced-analytics after each run (admin R&D users only)

create table if not exists user_analytics_profile (
  id                    uuid default gen_random_uuid() primary key,
  user_id               uuid not null unique,
  -- Top vendors by cumulative spend
  top_vendors           jsonb default '[]'::jsonb,          -- [{name, total, count}]
  -- Payment method distribution
  payment_methods       jsonb default '{}'::jsonb,          -- {cash: 3, credit_card: 7}
  -- Month-over-month deltas
  monthly_deltas        jsonb default '[]'::jsonb,          -- [{month, income_delta, expense_delta}]
  -- Discount data
  discount_total        numeric(12,2) default 0,
  discount_events       jsonb default '[]'::jsonb,          -- [{vendor, amount, date}]
  -- Income source breakdown
  income_sources        jsonb default '[]'::jsonb,          -- [{employer, total}]
  -- Tax paid per period
  tax_timeline          jsonb default '[]'::jsonb,          -- [{period, tax_amount}]
  -- Summary stats
  dominant_category     text,
  avg_monthly_income    numeric(12,2) default 0,
  avg_monthly_expenses  numeric(12,2) default 0,
  document_count        integer default 0,
  months_tracked        integer default 0,
  -- Metadata
  last_run_at           timestamptz,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

-- RLS: users can only see their own profile
alter table user_analytics_profile enable row level security;

create policy "Users own their analytics profile"
  on user_analytics_profile
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role can write (used by edge function with service key)
-- (service role bypasses RLS by default — no extra policy needed)

-- Auto-update updated_at
create or replace function update_user_analytics_profile_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_user_analytics_profile_updated_at
  before update on user_analytics_profile
  for each row execute function update_user_analytics_profile_updated_at();

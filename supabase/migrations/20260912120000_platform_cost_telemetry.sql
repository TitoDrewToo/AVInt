-- Internal cost telemetry for operational visibility. This is not customer data.
create table if not exists public.platform_cost_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  category text not null check (category in ('hosting', 'database', 'storage', 'bandwidth', 'security_scan', 'email', 'other')),
  provider text not null,
  description text not null check (char_length(trim(description)) between 1 and 180),
  estimated_cost_usd numeric(14,6) not null check (estimated_cost_usd >= 0),
  quantity numeric(20,6) check (quantity is null or quantity >= 0),
  unit text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index if not exists platform_cost_events_occurred_idx on public.platform_cost_events(occurred_at desc);
create index if not exists platform_cost_events_category_idx on public.platform_cost_events(category, occurred_at desc);
comment on table public.platform_cost_events is 'Internal estimated infrastructure/vendor costs; never exposed to regular users.';

alter table public.platform_cost_events enable row level security;
revoke all on public.platform_cost_events from anon, authenticated;
grant all on public.platform_cost_events to service_role;

create or replace view public.platform_monthly_cost_summary as
select date_trunc('month', occurred_at)::date as month,
       category,
       provider,
       sum(estimated_cost_usd)::numeric(14,6) as estimated_cost_usd,
       sum(coalesce(quantity, 0))::numeric(20,6) as quantity,
       count(*)::integer as event_count
from public.platform_cost_events
group by 1, 2, 3;

revoke all on public.platform_monthly_cost_summary from anon, authenticated;
grant select on public.platform_monthly_cost_summary to service_role;

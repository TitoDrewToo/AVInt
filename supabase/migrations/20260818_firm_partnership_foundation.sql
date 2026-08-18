-- Firm partnership foundation: firm accounts and linked firm administrators.
-- All provisioning is performed by a protected service-role route; firms do
-- not self-provision through the public site.

create table if not exists public.firms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  status text not null default 'active',
  seats_purchased integer not null default 0,
  seats_used integer not null default 0,
  partner_rate_cents integer not null default 10000,
  founding boolean not null default true,
  created_at timestamptz not null default now(),
  notes text,
  constraint firms_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint firms_status_check check (status in ('active', 'paused', 'closed')),
  constraint firms_seats_check check (seats_purchased >= 0 and seats_used >= 0 and seats_used <= seats_purchased),
  constraint firms_partner_rate_check check (partner_rate_cents > 0)
);

create table if not exists public.firm_admins (
  firm_id uuid not null references public.firms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (firm_id, user_id)
);

create index if not exists firm_admins_user_idx on public.firm_admins(user_id);

alter table public.firms enable row level security;
alter table public.firm_admins enable row level security;

revoke all on public.firms from anon, authenticated;
revoke all on public.firm_admins from anon, authenticated;
grant select on public.firms to authenticated;
grant select on public.firm_admins to authenticated;

drop policy if exists firms_select_linked_admin on public.firms;
create policy firms_select_linked_admin
  on public.firms for select to authenticated
  using (exists (
    select 1 from public.firm_admins a
    where a.firm_id = firms.id and a.user_id = auth.uid()
  ));

drop policy if exists firm_admins_select_linked_admin on public.firm_admins;
create policy firm_admins_select_linked_admin
  on public.firm_admins for select to authenticated
  using (exists (
    select 1 from public.firm_admins own
    where own.firm_id = firm_admins.firm_id and own.user_id = auth.uid()
  ));

-- The service_role grant is intentionally explicit for deployments that
-- revoke broad defaults. Supabase service_role bypasses RLS as well.
grant all on public.firms to service_role;
grant all on public.firm_admins to service_role;

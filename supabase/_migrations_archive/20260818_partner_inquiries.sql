-- Anonymous partner interest submissions for the accounting-firm funnel.
create table if not exists public.partner_inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  firm text not null,
  email text not null,
  client_count integer,
  message text not null,
  status text not null default 'new',
  constraint partner_inquiries_client_count_check check (client_count is null or client_count >= 0),
  constraint partner_inquiries_status_check check (status in ('new', 'contacted', 'qualified', 'closed'))
);

alter table public.partner_inquiries enable row level security;

revoke all on public.partner_inquiries from anon, authenticated;
grant insert on public.partner_inquiries to anon;
grant select, insert, update on public.partner_inquiries to service_role;

drop policy if exists "partner_inquiries_anon_insert" on public.partner_inquiries;
create policy "partner_inquiries_anon_insert"
  on public.partner_inquiries
  for insert
  to anon
  with check (true);

drop policy if exists "partner_inquiries_service_role_select" on public.partner_inquiries;
create policy "partner_inquiries_service_role_select"
  on public.partner_inquiries
  for select
  to service_role
  using (true);

-- Anonymous studio inquiry submissions for the AVIntelligence Studio funnel.
create table if not exists public.studio_inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  company text,
  message text not null,
  status text not null default 'new',
  constraint studio_inquiries_status_check check (status in ('new', 'contacted', 'qualified', 'closed'))
);

alter table public.studio_inquiries enable row level security;
revoke all on public.studio_inquiries from anon, authenticated;
grant insert on public.studio_inquiries to anon;
grant select, insert, update on public.studio_inquiries to service_role;

drop policy if exists "studio_inquiries_anon_insert" on public.studio_inquiries;
create policy "studio_inquiries_anon_insert" on public.studio_inquiries for insert to anon with check (true);
drop policy if exists "studio_inquiries_service_role_select" on public.studio_inquiries;
create policy "studio_inquiries_service_role_select" on public.studio_inquiries for select to service_role using (true);

create table if not exists public.support_inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  subject text not null,
  message text not null,
  context jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','in_progress','waiting_on_customer','resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_inquiries_created_at_idx on public.support_inquiries(created_at desc);
create index if not exists support_inquiries_user_id_idx on public.support_inquiries(user_id);

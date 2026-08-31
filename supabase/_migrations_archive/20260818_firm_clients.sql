-- Firm client enrollment and atomic annual-seat consumption.

create table if not exists public.firm_clients (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  seat_consumed boolean not null default true,
  unique (firm_id, user_id)
);

create index if not exists firm_clients_firm_idx on public.firm_clients(firm_id);
create index if not exists firm_clients_user_idx on public.firm_clients(user_id);

alter table public.firm_clients enable row level security;
revoke all on public.firm_clients from anon, authenticated;
grant select on public.firm_clients to authenticated;
grant all on public.firm_clients to service_role;

drop policy if exists firm_clients_select_self_or_admin on public.firm_clients;
create policy firm_clients_select_self_or_admin
  on public.firm_clients for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.firm_admins a
      where a.firm_id = firm_clients.firm_id and a.user_id = auth.uid()
    )
  );

-- Returns a stable result instead of raising for expected capacity failures.
-- The row lock serializes all enrollments for one firm.
create or replace function public.enroll_firm_client(p_firm_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  firm_row public.firms%rowtype;
  existing_id uuid;
begin
  if p_firm_id is null or p_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;

  select * into firm_row from public.firms where id = p_firm_id for update;
  if not found or firm_row.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'firm_unavailable');
  end if;

  select id into existing_id
  from public.firm_clients
  where firm_id = p_firm_id and user_id = p_user_id;
  if existing_id is not null then
    return jsonb_build_object('ok', true, 'enrolled', true, 'seat_consumed', false, 'firm_id', p_firm_id);
  end if;

  if firm_row.seats_used >= firm_row.seats_purchased then
    return jsonb_build_object('ok', false, 'code', 'seats_full');
  end if;

  insert into public.firm_clients (firm_id, user_id, seat_consumed)
  values (p_firm_id, p_user_id, true);

  update public.firms
  set seats_used = seats_used + 1
  where id = p_firm_id;

  return jsonb_build_object('ok', true, 'enrolled', true, 'seat_consumed', true, 'firm_id', p_firm_id);
end;
$$;

revoke all on function public.enroll_firm_client(uuid, uuid) from public, anon, authenticated;
grant execute on function public.enroll_firm_client(uuid, uuid) to service_role;

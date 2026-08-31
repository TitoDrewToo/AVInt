-- Idempotent ledger for annual firm-seat purchases.

create table if not exists public.firm_seat_purchases (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms(id) on delete restrict,
  provider text not null default 'creem',
  event_id text not null,
  order_id text,
  product_id text not null,
  units integer not null,
  amount_cents integer,
  created_at timestamptz not null default now(),
  unique (provider, event_id)
);

create index if not exists firm_seat_purchases_firm_idx on public.firm_seat_purchases(firm_id, created_at desc);
alter table public.firm_seat_purchases enable row level security;
revoke all on public.firm_seat_purchases from anon, authenticated;
grant all on public.firm_seat_purchases to service_role;

create or replace function public.record_firm_seat_purchase(
  p_firm_id uuid,
  p_event_id text,
  p_order_id text,
  p_product_id text,
  p_units integer,
  p_amount_cents integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_id uuid;
begin
  if p_firm_id is null or p_event_id is null or p_event_id = '' or p_units is null or p_units < 1 or p_units > 10000 then
    return jsonb_build_object('ok', false, 'code', 'invalid_input');
  end if;

  insert into public.firm_seat_purchases (firm_id, event_id, order_id, product_id, units, amount_cents)
  values (p_firm_id, p_event_id, p_order_id, p_product_id, p_units, p_amount_cents)
  on conflict (provider, event_id) do nothing
  returning id into inserted_id;

  if inserted_id is null then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  update public.firms
  set seats_purchased = seats_purchased + p_units
  where id = p_firm_id;
  if not found then
    delete from public.firm_seat_purchases where id = inserted_id;
    return jsonb_build_object('ok', false, 'code', 'firm_not_found');
  end if;

  return jsonb_build_object('ok', true, 'duplicate', false, 'units', p_units);
end;
$$;

revoke all on function public.record_firm_seat_purchase(uuid, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.record_firm_seat_purchase(uuid, text, text, text, integer, integer) to service_role;

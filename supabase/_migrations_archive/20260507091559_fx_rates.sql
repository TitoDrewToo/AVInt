create table public.fx_rates (
  rate_date date not null,
  base_currency text not null,
  target_currency text not null,
  rate numeric(20, 8) not null,
  source text not null default 'frankfurter',
  fetched_at timestamptz not null default now(),
  primary key (rate_date, base_currency, target_currency)
);

create index idx_fx_rates_date_currencies
  on public.fx_rates(rate_date, base_currency, target_currency);

alter table public.fx_rates enable row level security;

create policy "fx_rates readable by authenticated users"
  on public.fx_rates for select
  to authenticated using (true);

-- Record layer M2 parity migration. Already applied live.
alter table if exists public.payment_obligations
  add column if not exists record_id uuid references public.records(id) on delete set null;

create index if not exists payment_obligations_record_id_idx
  on public.payment_obligations(record_id);

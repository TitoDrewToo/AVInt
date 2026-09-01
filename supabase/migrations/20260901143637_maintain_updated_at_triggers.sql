-- records.updated_at, record_attributes.updated_at and datasets.updated_at
-- exist but were never maintained: nothing sets them on UPDATE. A record whose
-- amount was corrected today still read 2026-08-30.
--
-- This is not cosmetic. The column is the natural key for incremental sync,
-- change monitoring and "what moved since last run" reporting, and every one
-- of those would silently miss every change. It already produced one false
-- diagnostic during the corrections work: a query filtering on
-- records.updated_at > now() - interval '3 hours' returned zero rows while
-- records were in fact being updated.
--
-- Two per-table functions already exist (update_payment_obligations_updated_at,
-- set_virtual_updated_at). This adds one shared generic instead of a third
-- bespoke copy.
--
-- Existing rows are deliberately NOT backfilled. Their stored values are
-- wrong, but inventing a timestamp would assert a change time we do not know.
-- From here forward the column is trustworthy; before this migration it is
-- not, and that boundary is the migration's own timestamp.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists records_set_updated_at on public.records;
create trigger records_set_updated_at
  before update on public.records
  for each row execute function public.set_updated_at();

drop trigger if exists record_attributes_set_updated_at on public.record_attributes;
create trigger record_attributes_set_updated_at
  before update on public.record_attributes
  for each row execute function public.set_updated_at();

drop trigger if exists datasets_set_updated_at on public.datasets;
create trigger datasets_set_updated_at
  before update on public.datasets
  for each row execute function public.set_updated_at();

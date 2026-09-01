-- Named measures need to be summable.
--
-- record_attributes already holds the alternate figures every document type
-- carries — gross_income, net_income, tax_amount, discount_amount — but they
-- live in a jsonb `value` column, which is awkward to SUM and impossible to
-- index usefully. That is the same EAV weakness the record layer was built to
-- escape, hiding one table down.
--
-- One typed column makes every numeric attribute a first-class measure, so a
-- saved report can declare measure: "gross_income" (or "net_income", for a
-- user who wants take-home) and have it aggregate in Postgres like any typed
-- column.
--
-- Populated at write time in persist-derived.ts when value_type = 'number'.
-- Not a generated column: a malformed value would then fail the whole insert,
-- and an unparseable number should degrade to null, not reject the record.

alter table public.record_attributes
  add column if not exists value_numeric numeric;

comment on column public.record_attributes.value_numeric is
  'Typed projection of value when value_type = ''number''. Makes named measures (gross_income, tax_amount, ...) summable and indexable. Null when the value is not numeric.';

create index if not exists record_attributes_numeric_idx
  on public.record_attributes (field_key, record_id)
  where value_numeric is not null;

-- Backfill what is already there. jsonb numbers only; anything that does not
-- cast cleanly is left null rather than guessed at.
update public.record_attributes
   set value_numeric = (value #>> '{}')::numeric
 where value_type = 'number'
   and value_numeric is null
   and (value #>> '{}') ~ '^-?[0-9]+(\.[0-9]+)?$';

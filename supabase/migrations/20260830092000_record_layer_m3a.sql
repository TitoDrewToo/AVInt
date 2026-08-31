-- Record layer M3a parity migration.
-- Seed one auditable extraction per existing document_fields row. Already live.

insert into public.extractions (
  user_id, file_id, attempt_number, provider, model, status,
  payload, source_row_count, document_type
)
select
  df.user_id,
  df.file_id,
  1,
  'legacy',
  'document_fields_backfill',
  'succeeded',
  jsonb_build_object(
    'document_type', df.document_type,
    'document_date', df.document_date,
    'line_items', coalesce(df.line_items, '[]'::jsonb),
    'is_recurring', df.is_recurring,
    'currency', df.currency,
    'total_amount', df.total_amount,
    'vendor_name', df.vendor_name,
    'expense_category', df.expense_category,
    'vendor_normalized', df.vendor_normalized,
    'period_start', df.period_start,
    'period_end', df.period_end,
    'gross_income', df.gross_income,
    'net_income', df.net_income,
    'employer_name', df.employer_name,
    'tax_amount', df.tax_amount,
    'discount_amount', df.discount_amount,
    'jurisdiction', df.jurisdiction,
    'classification_rationale', df.classification_rationale,
    'merchant_domain', df.merchant_domain,
    'merchant_address_country', df.merchant_address_country,
    '_raw_json', df.raw_json
  ),
  case
    when jsonb_typeof(df.raw_json->'source_rows') = 'array' then jsonb_array_length(df.raw_json->'source_rows')
    else null
  end,
  df.document_type
from public.document_fields df
where not exists (
  select 1 from public.extractions e
  where e.file_id = df.file_id and e.attempt_number = 1
);

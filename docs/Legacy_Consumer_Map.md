# Legacy consumer map

This is the field-level inventory for the M4 phase 3b-ii decision. “Select *”
means the field travels through the returned object even when the call site does
not name it. “Derived” means the value is reconstructed from the new model,
not that a column with the same name exists.

## Call-site legend

- **DF pipeline reader** — `components/ui/document-modals.tsx`: `ReclassifyModal`
  selects explicit fields and uses the returned row; `components/ui/reclassify-sheet-modal.tsx`:
  `loadRows` and `saveRow` select explicit fields and use `raw_json` and the
  returned objects.
- **DF ingest reader** — `lib/smart-storage-ingest.ts`: `getFileFields` uses
  `select("*")`.
- **DF parity** — `scripts/report-parity.ts`: the legacy branches select and
  reshape fields for all seven report comparisons.
- **DF dashboard parity** — `scripts/dashboard-parity.ts`: the legacy branches
  select and reshape fields for dashboard and AI-context comparisons.
- **DF cleanup** — `scripts/delete-user.ts`: preview/count/delete-user-data
  verification selects `id,file_id` and counts rows.
- **DF renormalize** — `scripts/renormalize.ts`: selects
  `id,file_id,normalization_version` for the version backfill.
- **DF fixture** — `scripts/seed-reclassify-fixture.ts`: inserts fixture rows,
  deletes them during cleanup, and uses selected rows in the fixture flow.
- **DF manual** — `components/ui/document-modals.tsx`: `ManualEntryModal`
  inserts a complete row and `ReclassifyModal` updates fields during the
  compatibility period.
- **DF sheet write** — `components/ui/reclassify-sheet-modal.tsx`: the sheet
  correction path still writes `document_fields` as well as the records
  correction path.
- **Virtual projection** — `supabase/functions/_shared/virtual-records.ts`:
  `syncVirtualRecord` writes `virtual_records` and replaces
  `virtual_record_fields`; no current app reader remains after the viewer/API
  retirement. `scripts/backfill-virtual-records.ts` is a historical reader of
  `document_fields`, not a virtual-table reader.

## `document_fields`

| Field | Read by | Written by | New-model answer |
|---|---|---|---|
| `id` | DF pipeline reader; DF parity; DF dashboard parity; DF cleanup; DF fixture; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `derived` — legacy row identity is replaced by the record identity/pointer |
| `file_id` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF cleanup; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `records.file_id` |
| `vendor_name` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `record_attributes` field_key `vendor_name` |
| `employer_name` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `record_attributes` field_key `employer_name` |
| `document_date` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `records.occurred_on` |
| `currency` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `records.currency` |
| `total_amount` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `records.amount` |
| `gross_income` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `records.amount` for payslips; otherwise `record_attributes` field_key `gross_income` |
| `net_income` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `record_attributes` field_key `net_income` |
| `expense_category` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture; DF sheet write | `records.category` |
| `confidence_score` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `records.confidence` |
| `raw_json` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write; `components/ui/reclassify-sheet-modal.tsx` reads nested source/custom-field data; `supabase/functions/_shared/virtual-records.ts` reads source evidence/custom fields; `lib/document-classification.ts` reads the model fallback; `supabase/functions/generate-rd-analytics/index.ts` reads extraction excerpts | DF pipeline (historical); DF manual; DF fixture | `unresolved` — the old blob mixed model output, source metadata, and provider internals; only selected extraction payload paths have a direct home |
| `created_at` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF cleanup; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `derived` — creation time is supplied by the destination row, but is not the same legacy timestamp |
| `tax_amount` | DF pipeline reader; DF ingest reader; DF parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `record_attributes` field_key `tax_amount` |
| `discount_amount` | DF pipeline reader; DF ingest reader; DF parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `record_attributes` field_key `discount_amount` |
| `invoice_number` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `record_attributes` field_key `invoice_number` |
| `payment_method` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `record_attributes` field_key `payment_method` |
| `period_start` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `records.period_start` |
| `period_end` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `records.period_end` |
| `counterparty_name` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `record_attributes` field_key `counterparty_name` |
| `line_items` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write; `supabase/functions/normalize-document/index.ts` and `supabase/functions/reprocess-documents/index.ts` consume it from the legacy input during the compatibility period | DF pipeline (historical); DF manual; DF fixture | `derived` — child records plus child attributes are derived from the extraction payload |
| `normalization_status` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write; `scripts/report-parity.ts` and `scripts/dashboard-parity.ts` filter it | DF pipeline (historical); DF manual; DF fixture | `unresolved` — extraction status, `records.status`, `records.needs_review`, and `records.excluded_at` do not form a one-column equivalent |
| `normalized_at` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `unresolved` — no single new-model timestamp has the same normalization meaning |
| `normalization_error` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `extractions.<error path>` is not present in the current successful extraction contract; `unresolved` |
| `income_source` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `record_attributes` field_key `income_source` |
| `vendor_normalized` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `records.counterparty_normalized` |
| `jurisdiction` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `record_attributes` field_key `jurisdiction` |
| `classification_rationale` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `record_attributes` field_key `classification_rationale` |
| `normalization_version` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF renormalize; DF fixture; DF manual; DF sheet write; Virtual projection reads the value when projecting | DF pipeline (historical); DF manual; DF fixture | `unresolved` — it is pipeline metadata and has no records-layer field |
| `merchant_domain` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `record_attributes` field_key `merchant_domain` |
| `merchant_address_city` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `record_attributes` field_key `merchant_address_city` |
| `merchant_address_region` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `record_attributes` field_key `merchant_address_region` |
| `merchant_address_country` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `record_attributes` field_key `merchant_address_country` |
| `is_recurring` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `records.is_recurring` |
| `recurrence_cadence` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `record_attributes` field_key `recurrence_cadence` |
| `normalization_attempts` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `dead` — measured constant zero; no reader needs the value as a durable fact |
| `normalization_batch_id` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `unresolved` — the batch settlement protocol is not represented by one records/extractions payload field |
| `source_key` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write | DF pipeline (historical); DF manual; DF fixture | `records.source_key` |
| `notes` | DF pipeline reader; DF ingest reader; DF parity; DF dashboard parity; DF fixture; DF manual; DF sheet write; `components/ui/document-modals.tsx` collects it in manual entry | DF manual; DF fixture | `unresolved` — the one populated legacy value is not emitted by the current derivation contract |

## `virtual_records`

| Field | Read by | Written by | New-model answer |
|---|---|---|---|
| `id` | No current app consumer after the viewer/API retirement; historical viewer/API code was deleted | Virtual projection | `derived` — virtual identity is a projection identity |
| `user_id` | No current app consumer | Virtual projection | `records.user_id` |
| `file_id` | No current app consumer | Virtual projection | `records.file_id` |
| `source_record_id` | No current app consumer | Virtual projection | `records.id` |
| `document_type` | No current app consumer | Virtual projection | `records.document_type` |
| `record_type` | No current app consumer | Virtual projection | `records.record_type` |
| `status` | No current app consumer | Virtual projection | `unresolved` — virtual status accepted `raw/normalized/manual/failed`, unlike records status |
| `normalization_version` | No current app consumer | Virtual projection | `unresolved` — pipeline metadata has no records-layer home |
| `is_current` | No current app consumer | Virtual projection | `dead` — there is no remaining virtual projection reader |
| `created_at` | No current app consumer | Virtual projection | `derived` — projection timestamp only |
| `updated_at` | No current app consumer | Virtual projection | `derived` — projection timestamp only |

## `virtual_record_fields`

| Field | Read by | Written by | New-model answer |
|---|---|---|---|
| `id` | No current app consumer | Virtual projection | `derived` |
| `user_id` | No current app consumer | Virtual projection | `records.user_id` |
| `virtual_record_id` | No current app consumer | Virtual projection | `records.id` |
| `field_key` | No current app consumer | Virtual projection | `record_attributes` field_key `<key>` |
| `value` | No current app consumer | Virtual projection | `record_attributes` field_key `<key>` |
| `value_type` | No current app consumer | Virtual projection | `record_attributes` field_key `<key>` |
| `confidence` | No current app consumer | Virtual projection | `record_attributes` field_key `<key>` |
| `is_custom` | No current app consumer | Virtual projection | `record_attributes` field_key `<key>` |
| `source_evidence` | No current app consumer | Virtual projection | `record_attributes` field_key `<key>` |
| `created_at` | No current app consumer | Virtual projection | `derived` |
| `updated_at` | No current app consumer | Virtual projection | `derived` |

## Audit notes

- `raw_json` and `normalization_attempts` are not empty in the codebase even
  though the measured production facts say the former is no longer written and
  the latter is constant zero. Their remaining readers are listed in the
  report accompanying this map; they are not silently classified as dead.
- The map intentionally leaves `raw_json`, normalization lifecycle fields,
  `normalization_batch_id`, and `notes` unresolved where a single destination
  cannot be justified.
- Legacy consumers not reached by `loadDerivedRow` include the parity and
  dashboard harnesses, `lib/smart-storage-ingest.ts`, both reclassify UI paths,
  cleanup/fixture/renormalization scripts, and the virtual projection writer.

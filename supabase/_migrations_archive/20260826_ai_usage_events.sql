-- Append-only provider economics ledger. This is separate from
-- document_processing_usage, which is the customer entitlement meter.
create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  file_id uuid references public.files(id) on delete set null,
  document_field_id uuid references public.document_fields(id) on delete set null,
  file_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  source_row_count integer check (source_row_count is null or source_row_count >= 0),
  extracted_row_count integer check (extracted_row_count is null or extracted_row_count >= 0),
  document_type text,
  workload_class text not null default 'document',
  operation text not null check (operation in ('prescan_safety', 'extraction', 'spreadsheet_header_mapping', 'normalization')),
  provider text not null check (provider in ('openai', 'anthropic', 'gemini')),
  model text not null,
  attempt_number integer not null default 1 check (attempt_number > 0),
  status text not null check (status in ('succeeded', 'failed')),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  estimated_cost_usd numeric(14,8) not null default 0 check (estimated_cost_usd >= 0),
  pricing_version text not null default '2026-08-26-v1',
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  is_retry boolean not null default false,
  is_fallback boolean not null default false,
  billable_to_user boolean not null default false,
  error_category text,
  metadata jsonb not null default '{}'::jsonb
);

-- Keep this migration safe if the initial ledger definition was applied before
-- the workload dimensions were added.
alter table public.ai_usage_events add column if not exists file_type text;
alter table public.ai_usage_events add column if not exists file_size_bytes bigint;
alter table public.ai_usage_events add column if not exists source_row_count integer;
alter table public.ai_usage_events add column if not exists extracted_row_count integer;
alter table public.ai_usage_events add column if not exists document_type text;
alter table public.ai_usage_events add column if not exists workload_class text not null default 'document';
alter table public.ai_usage_events add column if not exists pricing_version text not null default '2026-08-26-v1';
alter table public.ai_usage_events add column if not exists duration_ms integer;

create index if not exists ai_usage_events_file_idx on public.ai_usage_events (file_id, created_at desc);
create index if not exists ai_usage_events_created_idx on public.ai_usage_events (created_at desc);
create index if not exists ai_usage_events_operation_idx on public.ai_usage_events (operation, created_at desc);

alter table public.ai_usage_events enable row level security;
revoke all on public.ai_usage_events from anon, authenticated;
grant all on public.ai_usage_events to service_role;

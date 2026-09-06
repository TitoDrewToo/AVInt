-- Resumable MCP ingestion. A batch idempotency key binds one request to an
-- exact ordered set of file fingerprints. Each file is claimed independently,
-- so retries resume unfinished items without duplicating completed uploads.

create table if not exists public.ingest_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  request_hash text not null,
  status text not null default 'processing',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingest_batches_key_length check (char_length(idempotency_key) between 1 and 120),
  constraint ingest_batches_status_check check (status in ('processing', 'completed', 'partial')),
  constraint ingest_batches_user_key_unique unique (user_id, idempotency_key),
  constraint ingest_batches_id_user_unique unique (id, user_id)
);

create table if not exists public.ingest_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  user_id uuid not null,
  item_index integer not null,
  input_hash text not null,
  filename text not null,
  mime_type text not null,
  byte_size bigint not null,
  file_id uuid references public.files(id) on delete set null,
  status text not null default 'pending',
  error_message text,
  attempt_count integer not null default 0,
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingest_batch_items_batch_user_fkey foreign key (batch_id, user_id)
    references public.ingest_batches(id, user_id) on delete cascade,
  constraint ingest_batch_items_position_check check (item_index between 0 and 5),
  constraint ingest_batch_items_byte_size_check check (byte_size >= 0),
  constraint ingest_batch_items_attempt_count_check check (attempt_count >= 0),
  constraint ingest_batch_items_status_check check (
    status in ('pending', 'uploading', 'processing', 'normalized', 'rejected', 'saved_at_cap', 'failed')
  ),
  constraint ingest_batch_items_batch_position_unique unique (batch_id, item_index)
);

create index if not exists ingest_batches_user_updated_idx
  on public.ingest_batches (user_id, updated_at desc);
create index if not exists ingest_batch_items_user_file_idx
  on public.ingest_batch_items (user_id, file_id) where file_id is not null;
create index if not exists ingest_batch_items_resumable_idx
  on public.ingest_batch_items (batch_id, lease_expires_at)
  where status in ('pending', 'uploading', 'processing', 'failed');

alter table public.ingest_batches enable row level security;
alter table public.ingest_batch_items enable row level security;
revoke all on table public.ingest_batches, public.ingest_batch_items from public, anon, authenticated;
grant all on table public.ingest_batches, public.ingest_batch_items to service_role;

drop trigger if exists ingest_batches_set_updated_at on public.ingest_batches;
create trigger ingest_batches_set_updated_at before update on public.ingest_batches
  for each row execute function public.set_updated_at();
drop trigger if exists ingest_batch_items_set_updated_at on public.ingest_batch_items;
create trigger ingest_batch_items_set_updated_at before update on public.ingest_batch_items
  for each row execute function public.set_updated_at();

create or replace function public.avint_claim_ingest_batch(
  p_user_id uuid,
  p_idempotency_key text,
  p_request_hash text,
  p_items jsonb
)
returns table (
  batch_id uuid,
  item_id uuid,
  item_index integer,
  item_status text,
  file_id uuid,
  lease_token uuid,
  claimed boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_batch_id uuid;
  v_request_hash text;
  v_input_count integer;
  v_stored_count integer;
begin
  if p_user_id is null or p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 120 then
    raise exception 'A valid user and idempotency key are required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Batch items must be an array' using errcode = '22023';
  end if;
  v_input_count := jsonb_array_length(p_items);
  if v_input_count not between 1 and 6 then
    raise exception 'A batch must contain between 1 and 6 files' using errcode = '22023';
  end if;

  insert into public.ingest_batches (user_id, idempotency_key, request_hash)
  values (p_user_id, p_idempotency_key, p_request_hash)
  on conflict (user_id, idempotency_key) do nothing;

  select b.id, b.request_hash
    into v_batch_id, v_request_hash
  from public.ingest_batches b
  where b.user_id = p_user_id and b.idempotency_key = p_idempotency_key
  for update;

  if v_request_hash <> p_request_hash then
    raise exception 'Idempotency key was already used for different files' using errcode = '22000';
  end if;

  insert into public.ingest_batch_items (
    batch_id, user_id, item_index, input_hash, filename, mime_type, byte_size
  )
  select
    v_batch_id,
    p_user_id,
    (item.value ->> 'item_index')::integer,
    item.value ->> 'input_hash',
    item.value ->> 'filename',
    item.value ->> 'mime_type',
    (item.value ->> 'byte_size')::bigint
  from jsonb_array_elements(p_items) as item(value)
  on conflict (batch_id, item_index) do nothing;

  select count(*) into v_stored_count
  from public.ingest_batch_items i
  where i.batch_id = v_batch_id;

  if v_stored_count <> v_input_count or exists (
    select 1
    from jsonb_array_elements(p_items) as item(value)
    join public.ingest_batch_items i
      on i.batch_id = v_batch_id
     and i.item_index = (item.value ->> 'item_index')::integer
    where i.input_hash <> item.value ->> 'input_hash'
       or i.filename <> item.value ->> 'filename'
       or i.mime_type <> item.value ->> 'mime_type'
       or i.byte_size <> (item.value ->> 'byte_size')::bigint
  ) then
    raise exception 'Idempotency key was already used for different batch contents' using errcode = '22000';
  end if;

  return query
  with newly_claimed as (
    update public.ingest_batch_items i
       set status = 'uploading',
           error_message = null,
           attempt_count = i.attempt_count + 1,
           lease_token = gen_random_uuid(),
           lease_expires_at = now() + interval '5 minutes'
     where i.batch_id = v_batch_id
       and (
         i.status in ('pending', 'failed')
         or (i.status in ('uploading', 'processing') and i.lease_expires_at < now())
       )
    returning i.id
  )
  select
    i.batch_id,
    i.id,
    i.item_index,
    i.status,
    i.file_id,
    i.lease_token,
    c.id is not null
  from public.ingest_batch_items i
  left join newly_claimed c on c.id = i.id
  where i.batch_id = v_batch_id
  order by i.item_index;
end;
$$;

revoke all on function public.avint_claim_ingest_batch(uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.avint_claim_ingest_batch(uuid, text, text, jsonb)
  to service_role;

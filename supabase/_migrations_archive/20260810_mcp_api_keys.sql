-- Smart Storage MCP connector API keys (v0).
-- Plaintext keys never leave the create response and are never stored.

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key_hash text not null unique,
  prefix text not null,
  name text not null,
  scopes text[] not null default array['smart_storage']::text[],
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz
);

alter table public.api_keys add column if not exists expires_at timestamptz;

create index if not exists api_keys_user_id_idx on public.api_keys(user_id);
create index if not exists api_keys_active_hash_idx on public.api_keys(key_hash) where revoked_at is null;

alter table public.api_keys enable row level security;

drop policy if exists "api_keys_select_own" on public.api_keys;
create policy "api_keys_select_own" on public.api_keys for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "api_keys_insert_own" on public.api_keys;
create policy "api_keys_insert_own" on public.api_keys for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "api_keys_revoke_own" on public.api_keys;
create policy "api_keys_revoke_own" on public.api_keys for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.api_keys from anon;
grant select, insert, update on public.api_keys to authenticated;
revoke all on public.api_keys from service_role;
grant select, insert, update, delete on public.api_keys to service_role;

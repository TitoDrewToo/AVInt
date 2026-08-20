-- Google Drive connection state and file provenance.
-- Refresh tokens are encrypted by the application before they reach this table.

create table if not exists public.google_drive_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_subject text not null,
  google_email text,
  encrypted_refresh_token text not null,
  access_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.google_drive_connections enable row level security;

drop policy if exists "Users can view their Google Drive connection" on public.google_drive_connections;
create policy "Users can view their Google Drive connection"
  on public.google_drive_connections for select
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their Google Drive connection" on public.google_drive_connections;
create policy "Users can delete their Google Drive connection"
  on public.google_drive_connections for delete
  using (auth.uid() = user_id);

revoke all on public.google_drive_connections from anon, authenticated;
grant select, delete on public.google_drive_connections to authenticated;

alter table public.files
  add column if not exists source_provider text,
  add column if not exists source_file_id text,
  add column if not exists source_url text,
  add column if not exists source_modified_at timestamptz;

alter table public.files
  drop constraint if exists files_source_provider_check;

alter table public.files
  add constraint files_source_provider_check
  check (source_provider is null or source_provider in ('google_drive'));

create unique index if not exists files_user_drive_source_idx
  on public.files (user_id, source_provider, source_file_id)
  where source_provider is not null and source_file_id is not null;

create index if not exists files_source_provider_idx
  on public.files (user_id, source_provider)
  where source_provider is not null;

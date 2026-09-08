-- Timestamp prescan ownership so a dead Edge Function invocation can be
-- distinguished from an active scanner without relying on file creation time.

alter table public.files
  add column if not exists prescan_claimed_at timestamptz;

update public.files
set prescan_claimed_at = coalesce(scanned_at, created_at at time zone 'UTC', now())
where upload_status = 'scanning'
  and prescan_claimed_at is null;

create index if not exists files_stale_prescan_claim_idx
  on public.files (prescan_claimed_at, id)
  where upload_status = 'scanning';

comment on column public.files.prescan_claimed_at is
  'Time the current prescan invocation atomically claimed this file; cleared by every terminal prescan outcome.';

-- RLS limits file mutations to the owning user, but ownership alone must not
-- let a browser forge security lifecycle state. The browser only needs to
-- rename/move a file and persist spreadsheet-review metadata after creation.
revoke update on table public.files from authenticated;
grant update (filename, folder_id, analysis_json) on table public.files to authenticated;

-- Browser uploads create the landing-zone row. All pipeline-owned columns use
-- database defaults or are populated later by service-role functions.
revoke insert on table public.files from authenticated;
grant insert (
  user_id,
  filename,
  storage_path,
  file_type,
  file_size,
  document_type,
  upload_status,
  folder_id
) on table public.files to authenticated;

create or replace function public.avint_enforce_browser_file_ingress()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Service-role and trusted database writers retain the existing ingestion
  -- and manual-entry paths. This contract applies only to authenticated
  -- PostgREST callers creating a physical upload row.
  if current_user = 'authenticated' then
    if new.user_id is distinct from (select auth.uid()) then
      raise exception 'file owner must match the authenticated user'
        using errcode = '42501';
    end if;

    if new.storage_path !~ ('^' || new.user_id::text || '/_inbox/[^/]+$') then
      raise exception 'browser uploads must enter the private inbox'
        using errcode = '42501';
    end if;

    -- The client may state these values for compatibility with the existing
    -- insert shape, but the database remains authoritative.
    new.upload_status := 'pending_scan';
    new.document_type := 'unknown';
  end if;

  return new;
end;
$$;

revoke execute on function public.avint_enforce_browser_file_ingress()
  from public, anon, authenticated;
grant execute on function public.avint_enforce_browser_file_ingress()
  to service_role;

drop trigger if exists files_enforce_browser_ingress on public.files;
create trigger files_enforce_browser_ingress
before insert on public.files
for each row execute function public.avint_enforce_browser_file_ingress();

comment on function public.avint_enforce_browser_file_ingress() is
  'Forces authenticated physical uploads through the prescan inbox and prevents browser-authored lifecycle state.';

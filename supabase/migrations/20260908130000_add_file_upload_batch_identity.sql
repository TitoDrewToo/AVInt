-- One opaque identifier ties the files selected in a browser, MCP, or API
-- upload together. It supports customer-safe batch outcome summaries without
-- changing prescan, extraction, or normalization behavior.

alter table public.files
  add column if not exists upload_batch_id uuid;

update public.files
set upload_batch_id = id
where upload_batch_id is null
  and file_type <> 'manual';

create index if not exists files_user_upload_batch_idx
  on public.files (user_id, upload_batch_id, created_at desc)
  where upload_batch_id is not null;

comment on column public.files.upload_batch_id is
  'Opaque identity shared by files selected in one upload request; not a processing transaction boundary.';

-- Preserve the browser ingress boundary while admitting only the new batch
-- identity column. Revoke inherited/public table privileges as well as direct
-- role privileges so column grants are the sole browser write capability.
revoke insert, update on table public.files from public, anon, authenticated;
grant update (filename, folder_id, analysis_json) on table public.files to authenticated;
grant insert (
  user_id,
  filename,
  storage_path,
  file_type,
  file_size,
  document_type,
  upload_status,
  folder_id,
  upload_batch_id
) on table public.files to authenticated;

create or replace function public.avint_enforce_browser_file_ingress()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_user = 'authenticated' then
    if new.user_id is distinct from (select auth.uid()) then
      raise exception 'file owner must match the authenticated user'
        using errcode = '42501';
    end if;

    if new.storage_path !~ ('^' || new.user_id::text || '/_inbox/[^/]+$') then
      raise exception 'browser uploads must enter the private inbox'
        using errcode = '42501';
    end if;

    new.upload_status := 'pending_scan';
    new.document_type := 'unknown';
    new.upload_batch_id := coalesce(new.upload_batch_id, gen_random_uuid());
  end if;

  return new;
end;
$$;

revoke execute on function public.avint_enforce_browser_file_ingress()
  from public, anon, authenticated;
grant execute on function public.avint_enforce_browser_file_ingress()
  to service_role;

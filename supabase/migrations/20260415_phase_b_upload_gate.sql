-- Phase B — upload gate state machine + storage RLS tightening
-- See CLAUDE.md governance notes: any change to access control / schema is
-- material and must be reviewed before deploy.

-- 1. Forensic columns on files ------------------------------------------------
alter table public.files
  add column if not exists sha256      text,
  add column if not exists scan_reason text,
  add column if not exists scanned_at  timestamptz;

create index if not exists files_upload_status_idx on public.files(upload_status);
create index if not exists files_sha256_idx        on public.files(sha256);

-- 2. upload_status state machine ---------------------------------------------
-- Valid states:
--   pending_scan → scanning → approved → processing → normalized → done
--                                                                ↘ quarantined (terminal)
-- Legacy 'uploaded' kept for backwards compatibility with existing rows.
alter table public.files
  drop constraint if exists files_upload_status_check;

alter table public.files
  add constraint files_upload_status_check
  check (upload_status in (
    'uploaded',
    'pending_scan',
    'scanning',
    'approved',
    'processing',
    'normalized',
    'done',
    'quarantined'
  ));

-- 3. Storage RLS partitioning ------------------------------------------------
-- _inbox/ and _quarantine/ are server-managed paths. Clients cannot
-- SELECT / UPDATE / DELETE objects there. They CAN insert into _inbox/
-- (this is the upload landing zone) but cannot read back until the
-- scanner has moved the object to the canonical path.

drop policy if exists "Users can delete their own files" on storage.objects;
drop policy if exists "Users can read their own files"   on storage.objects;
drop policy if exists "Users can update their own files" on storage.objects;
drop policy if exists "Users can upload their own files" on storage.objects;

create policy "users_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "users_select_own_canonical"
  on storage.objects for select
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((storage.foldername(name))[2], '') not in ('_inbox','_quarantine')
  );

create policy "users_update_own_canonical"
  on storage.objects for update
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((storage.foldername(name))[2], '') not in ('_inbox','_quarantine')
  );

create policy "users_delete_own_canonical"
  on storage.objects for delete
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((storage.foldername(name))[2], '') not in ('_inbox','_quarantine')
  );

-- 4. Documents bucket config -------------------------------------------------
-- MIME allowlist enforced at infra boundary (Supabase rejects bad MIME at
-- upload API, before any edge function runs). 60 MB file_size_limit gives
-- headroom over the 50 MB client cap.
update storage.buckets
set
  allowed_mime_types = array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ],
  file_size_limit = 62914560
where id = 'documents';

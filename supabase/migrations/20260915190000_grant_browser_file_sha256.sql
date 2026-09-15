-- Browser uploads compute the digest before creating the file row so duplicate
-- detection can run before prescan.  The column-level INSERT allowlist must
-- include that value; without it PostgREST rejects the whole row with a
-- misleading `permission denied for table files` error.
grant insert (
  user_id,
  filename,
  storage_path,
  file_type,
  file_size,
  document_type,
  upload_status,
  folder_id,
  upload_batch_id,
  sha256
) on table public.files to authenticated;

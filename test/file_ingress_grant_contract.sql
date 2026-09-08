-- Browser file metadata is deliberately narrower than owner-row RLS.
-- Run after a fresh `supabase db reset` and against staging before promotion.

do $$
declare
  column_name text;
  allowed_update constant text[] := array['filename', 'folder_id', 'analysis_json'];
  allowed_insert constant text[] := array[
    'user_id', 'filename', 'storage_path', 'file_type', 'file_size',
    'document_type', 'upload_status', 'folder_id', 'upload_batch_id'
  ];
begin
  if has_table_privilege('authenticated', 'public.files', 'UPDATE') then
    raise exception 'authenticated retains table-wide UPDATE on public.files';
  end if;

  if has_table_privilege('authenticated', 'public.files', 'INSERT') then
    raise exception 'authenticated retains table-wide INSERT on public.files';
  end if;

  for column_name in
    select a.attname
    from pg_attribute a
    where a.attrelid = 'public.files'::regclass
      and a.attnum > 0
      and not a.attisdropped
  loop
    if has_column_privilege('authenticated', 'public.files', column_name, 'UPDATE')
       <> (column_name = any(allowed_update)) then
      raise exception 'Unexpected authenticated UPDATE privilege on files.%', column_name;
    end if;

    if has_column_privilege('authenticated', 'public.files', column_name, 'INSERT')
       <> (column_name = any(allowed_insert)) then
      raise exception 'Unexpected authenticated INSERT privilege on files.%', column_name;
    end if;
  end loop;

  if has_function_privilege('authenticated', 'public.avint_enforce_browser_file_ingress()'::regprocedure, 'EXECUTE')
     or has_function_privilege('anon', 'public.avint_enforce_browser_file_ingress()'::regprocedure, 'EXECUTE') then
    raise exception 'Browser roles can execute the file ingress trigger function directly';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.files'::regclass
      and tgname = 'files_enforce_browser_ingress'
      and tgenabled <> 'D'
      and not tgisinternal
  ) then
    raise exception 'files_enforce_browser_ingress trigger is absent or disabled';
  end if;
end
$$;

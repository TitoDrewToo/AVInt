-- Storage quota enforcement.
-- Free, day-pass, and gift-code users get 5 GiB. Monthly Pro gets 1 TiB.
-- Annual Pro gets 2 TiB. Creem is the active provider; subscriptions.plan
-- distinguishes monthly vs annual Pro.

create or replace function public.avint_storage_quota_bytes(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  sub record;
begin
  select status, plan, current_period_end
  into sub
  from public.subscriptions
  where user_id = p_user_id
  order by updated_at desc nulls last, created_at desc
  limit 1;

  if sub.status = 'pro' then
    if sub.plan = 'annual' then
      return 2199023255552; -- 2 TiB
    end if;
    return 1099511627776; -- 1 TiB
  end if;

  return 5368709120; -- 5 GiB
end;
$$;

create or replace function public.avint_enforce_file_storage_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_bytes bigint;
  quota_bytes bigint;
begin
  if new.user_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.user_id::text));

  select coalesce(sum(file_size), 0)
  into current_bytes
  from public.files
  where user_id = new.user_id
    and id is distinct from new.id;

  quota_bytes := public.avint_storage_quota_bytes(new.user_id);

  if current_bytes + coalesce(new.file_size, 0) > quota_bytes then
    raise exception 'Storage quota exceeded'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists files_storage_quota_enforcement on public.files;
create trigger files_storage_quota_enforcement
before insert or update of file_size, user_id
on public.files
for each row
execute function public.avint_enforce_file_storage_quota();

-- Keep browser uploads in the scan landing zone. The aggregate quota is enforced
-- by files metadata above; this prevents clients from writing directly to
-- canonical or quarantine paths.
drop policy if exists "users_insert_own" on storage.objects;
drop policy if exists "users_insert_own_inbox" on storage.objects;
create policy "users_insert_own_inbox"
  on storage.objects for insert
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and (storage.foldername(name))[2] = '_inbox'
  );

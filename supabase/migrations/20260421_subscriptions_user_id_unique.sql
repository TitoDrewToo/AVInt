-- Enforce one subscription row per authenticated user.
--
-- Why partial (user_id IS NOT NULL): pre-signup webhook rows are inserted
-- with user_id = NULL and linked retroactively once the user registers
-- (see app/api/webhooks/creem/route.ts "Retroactively link user_id"). A
-- full unique constraint would reject those pending rows.
--
-- Why the pre-check: previous webhook logic did check-then-insert which
-- can double-insert under concurrent delivery. If any duplicates exist now,
-- the CREATE UNIQUE INDEX below would fail mid-migration and leave the DB
-- in a confusing state. Fail loud here instead.

do $$
declare
  dup_count int;
begin
  select count(*) into dup_count
  from (
    select user_id
    from public.subscriptions
    where user_id is not null
    group by user_id
    having count(*) > 1
  ) s;

  if dup_count > 0 then
    raise exception
      'Cannot add unique index: % user_ids have duplicate subscription rows. Reconcile before re-running.',
      dup_count;
  end if;
end $$;

create unique index if not exists subscriptions_user_id_unique
  on public.subscriptions (user_id)
  where user_id is not null;

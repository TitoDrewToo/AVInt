-- A seat-funded client receives the annual Pro-equivalent storage allowance.
create or replace function public.avint_storage_quota_bytes(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  sub record;
  firm_start timestamptz;
begin
  select status, plan, current_period_end into sub
  from public.subscriptions where user_id = p_user_id
  order by updated_at desc nulls last, created_at desc limit 1;

  if sub.status = 'pro' then
    if sub.plan = 'annual' then return 2199023255552; end if;
    return 1099511627776;
  end if;

  select fc.created_at into firm_start
  from public.firm_clients fc
  join public.firms f on f.id = fc.firm_id
  where fc.user_id = p_user_id and f.status = 'active'
    and fc.created_at > now() - interval '1 year'
  order by fc.created_at desc limit 1;
  if firm_start is not null then return 2199023255552; end if;
  return 5368709120;
end;
$$;

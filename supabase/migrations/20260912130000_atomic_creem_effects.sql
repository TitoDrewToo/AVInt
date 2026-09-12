-- All effects are database-local: one transaction replaces a lease/saga.
-- A failed statement rolls back BOTH effects and the delivery marker.
-- Existing markers remain untouched: historical partial deliveries need reconciliation.
create table public.creem_effect_receipts (
  effect_key text primary key,
  event_id text not null,
  created_at timestamptz not null default now()
);
alter table public.creem_effect_receipts enable row level security;
revoke all on public.creem_effect_receipts from public, anon, authenticated;
grant select, insert on public.creem_effect_receipts to service_role;

create or replace function public.avint_apply_creem_event(p_event_id text, p_event_type text, p_effect jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_action text := p_effect->>'action';
  v_email text := lower(trim(p_effect->>'email'));
  v_user uuid;
  v_subscription uuid;
  v_matches integer;
  v_inserted text;
  v_result jsonb;
  v_period timestamp;
begin
  if coalesce(trim(p_event_id), '') = '' or coalesce(trim(p_event_type), '') = '' then
    raise exception 'Missing event identity';
  end if;
  if v_action is null or v_action not in ('ignore','firm','gift','subscription','cancel','refund') then
    raise exception 'Unsupported effect';
  end if;
  -- Short database-only critical section. Serializes related subscription/order
  -- changes and email-before-registration writes as well as duplicate deliveries.
  perform pg_advisory_xact_lock(749302611);
  insert into public.processed_webhook_events(provider,event_id,event_type)
    values ('creem',p_event_id,p_event_type) on conflict do nothing returning event_id into v_inserted;
  if v_inserted is null then return jsonb_build_object('ok',true,'duplicate',true); end if;

  if v_action in ('gift','firm') or (v_action = 'subscription' and p_effect->>'plan' = 'day_pass') then
    if coalesce(p_effect->>'order_id','') = '' then raise exception 'Missing order identity'; end if;
    v_inserted := null;
    insert into public.creem_effect_receipts(effect_key,event_id)
      values (v_action || ':order:' || (p_effect->>'order_id'),p_event_id)
      on conflict do nothing returning effect_key into v_inserted;
    if v_inserted is null then return jsonb_build_object('ok',true,'duplicate_effect',true); end if;
  end if;

  if v_action = 'firm' then
    v_result := public.record_firm_seat_purchase((p_effect->>'firm_id')::uuid,p_event_id,
      p_effect->>'order_id',p_effect->>'product_id',(p_effect->>'units')::integer,(p_effect->>'amount_cents')::integer);
    if not coalesce((v_result->>'ok')::boolean,false) then raise exception 'Firm seat effect failed'; end if;
  elsif v_action = 'gift' then
    if coalesce(v_email,'') = '' or coalesce(p_effect->>'code','') = '' then raise exception 'Missing gift fields'; end if;
    -- Never reset a redeemed code on retry, including a new event for the same order.
    if not exists (select 1 from public.gift_codes where lemonsqueezy_order_id = p_effect->>'order_id') then
      insert into public.gift_codes(code,status,plan,duration_hours,purchased_by_email,lemonsqueezy_order_id)
        values (p_effect->>'code','pending','monthly',24,v_email,p_effect->>'order_id');
    end if;
  elsif v_action = 'subscription' then
    if coalesce(v_email,'') = '' or coalesce(p_effect->>'plan','') not in ('monthly','annual','day_pass')
      or coalesce(p_effect->>'status','') not in ('pro','day_pass') then raise exception 'Invalid subscription fields'; end if;
    v_user := public.get_user_id_by_email(v_email);
    select count(*) into v_matches from public.subscriptions where
      (v_user is not null and user_id = v_user) or lower(email) = v_email;
    if v_matches > 1 then raise exception 'Subscription identity requires reconciliation'; end if;
    select id into v_subscription from public.subscriptions where
      (v_user is not null and user_id = v_user) or lower(email) = v_email for update;
    if exists (select 1 from public.subscriptions where id = v_subscription and user_id is not null and user_id is distinct from v_user) then
      raise exception 'Subscription identity mismatch';
    end if;
    v_period := case when p_effect->>'plan' = 'day_pass' then (now() + interval '24 hours') at time zone 'UTC'
      else (p_effect->>'period_end')::timestamptz at time zone 'UTC' end;
    if v_period is null then raise exception 'Missing period end'; end if;
    if v_subscription is null then
      insert into public.subscriptions(user_id,email,status,plan,current_period_end,product_name,variant_id,
        lemonsqueezy_customer_id,lemonsqueezy_subscription_id,lemonsqueezy_order_id)
      values (v_user,v_email,p_effect->>'status',p_effect->>'plan',v_period,p_effect->>'product_name',p_effect->>'product_id',
        p_effect->>'customer_id',p_effect->>'subscription_id',p_effect->>'order_id');
    else
      update public.subscriptions set user_id = coalesce(v_user,user_id),email=v_email,
        status=p_effect->>'status',plan=p_effect->>'plan',current_period_end=v_period,
        product_name=p_effect->>'product_name',variant_id=p_effect->>'product_id',
        lemonsqueezy_customer_id=p_effect->>'customer_id',lemonsqueezy_subscription_id=p_effect->>'subscription_id',
        lemonsqueezy_order_id=coalesce(nullif(p_effect->>'order_id',''),lemonsqueezy_order_id),updated_at=now()
      where id=v_subscription;
    end if;
    if coalesce(p_effect->>'counter_key','') = '' then raise exception 'Missing counter identity'; end if;
    v_inserted := null;
    insert into public.creem_effect_receipts(effect_key,event_id) values ('counter:' || (p_effect->>'counter_key'),p_event_id)
      on conflict do nothing returning effect_key into v_inserted;
    if v_inserted is not null then perform public.increment_user_counter(); end if;
  elsif v_action = 'cancel' then
    if coalesce(p_effect->>'subscription_id','') = '' then raise exception 'Missing subscription identity'; end if;
    update public.subscriptions set status='cancelled',updated_at=now()
      where lemonsqueezy_subscription_id=p_effect->>'subscription_id';
    if not found then raise exception 'Cancellation target not found'; end if;
  elsif v_action = 'refund' then
    if coalesce(p_effect->>'order_id','') = '' then raise exception 'Missing refund order'; end if;
    update public.subscriptions set status='free',plan=null,current_period_end=null,updated_at=now()
      where lemonsqueezy_order_id=p_effect->>'order_id';
    -- Gift/firm/older renewal refunds require a reviewed reconciliation path;
    -- do not acknowledge them as successfully revoked.
    if not found then raise exception 'Refund target requires reconciliation'; end if;
  end if;
  return jsonb_build_object('ok',true,'duplicate',false);
end;
$$;
revoke all on function public.avint_apply_creem_event(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.avint_apply_creem_event(text,text,jsonb) to service_role;

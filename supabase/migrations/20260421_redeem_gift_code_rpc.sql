-- Atomic gift redemption.
--
-- Replaces the three-step check-then-act flow in /api/redeem-gift that had a
-- race: two concurrent requests with the same code could both pass the status
-- check and both grant subscription access.
--
-- The conditional UPDATE returning a row is the atomic claim. Only the
-- request whose UPDATE matches (status='pending' AND not expired) wins.
-- Losers diagnose the failure mode (invalid / already_redeemed / expired)
-- with a follow-up SELECT and return a structured result.
--
-- Both the gift_codes claim and the subscriptions upsert run in one implicit
-- transaction (function body), so a subscription cannot be granted without a
-- matching claim.

create or replace function public.redeem_gift_code(
  p_code             text,
  p_user_id          uuid,
  p_email            text,
  p_access_ends_at   timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code_row gift_codes%rowtype;
  v_now      timestamptz := now();
begin
  update gift_codes
     set status              = 'redeemed',
         redeemed_by_user_id = p_user_id,
         redeemed_at         = v_now
   where code   = p_code
     and status = 'pending'
     and (expires_at is null or expires_at > v_now)
   returning * into v_code_row;

  if not found then
    select * into v_code_row from gift_codes where code = p_code;
    if not found then
      return jsonb_build_object('result', 'invalid');
    end if;
    if v_code_row.status = 'redeemed' then
      return jsonb_build_object('result', 'already_redeemed');
    end if;
    if v_code_row.expires_at is not null and v_code_row.expires_at <= v_now then
      return jsonb_build_object('result', 'expired');
    end if;
    return jsonb_build_object('result', 'invalid');
  end if;

  -- Manual upsert — subscriptions has no unique constraint on user_id,
  -- only an index, so on-conflict isn't available here.
  update subscriptions
     set email              = p_email,
         status             = 'gift_code',
         plan               = 'gift_code',
         current_period_end = p_access_ends_at,
         updated_at         = v_now
   where user_id = p_user_id;

  if not found then
    insert into subscriptions (user_id, email, status, plan, current_period_end, updated_at)
    values (p_user_id, p_email, 'gift_code', 'gift_code', p_access_ends_at, v_now);
  end if;

  return jsonb_build_object(
    'result', 'redeemed',
    'plan',   v_code_row.plan
  );
end;
$$;

revoke all on function public.redeem_gift_code(text, uuid, text, timestamptz) from public;
grant execute on function public.redeem_gift_code(text, uuid, text, timestamptz) to service_role;

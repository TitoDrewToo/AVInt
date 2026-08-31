-- Security Advisor hardening for SECURITY DEFINER functions.
-- These statements are guarded because some legacy functions were created
-- directly in the hosted project rather than through repository migrations.

-- P0: destructive and identity-lookup RPCs are server-only.
revoke execute on function public.delete_user_data(uuid) from anon, authenticated;
revoke execute on function public.get_user_id_by_email(text) from anon, authenticated;
grant execute on function public.delete_user_data(uuid) to service_role;
grant execute on function public.get_user_id_by_email(text) to service_role;

-- P1: no browser role needs to invoke these maintenance/server functions.
do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.handle_new_user_subscription()',
    'public.rls_auto_enable()',
    'public.sweep_stuck_processing_jobs()',
    'public.increment_user_counter()',
    'public.rate_limit_hit(text,text,integer,integer)',
    'public.avint_enforce_file_storage_quota()',
    'public.avint_storage_quota_bytes(uuid)',
    'public.redeem_gift_code(text,uuid,text,timestamptz)'
  ] loop
    if to_regprocedure(signature) is not null then
      execute format('revoke execute on function %s from anon, authenticated', signature);
    end if;
  end loop;
end
$$;

-- P2: make legacy trigger/maintenance SECURITY DEFINER functions explicit
-- about their object-resolution schema. The guards keep this migration safe
-- across projects where one of these legacy functions is absent.
do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.handle_new_user_subscription()',
    'public.increment_user_counter()',
    'public.update_payment_obligations_updated_at()'
  ] loop
    if to_regprocedure(signature) is not null then
      execute format('alter function %s set search_path = public', signature);
    end if;
  end loop;
end
$$;

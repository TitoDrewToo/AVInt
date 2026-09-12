-- Atomic organization seat allocation for concurrent invitations.
create or replace function public.avint_claim_organization_seat(
  p_organization_id uuid,
  p_user_id uuid,
  p_role text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  org public.organizations;
  member public.organization_members;
begin
  if p_role not in ('admin', 'editor', 'reviewer', 'viewer') then
    return jsonb_build_object('ok', false, 'code', 'invalid_role');
  end if;
  select * into org from public.organizations where id = p_organization_id for update;
  if not found or org.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'organization_unavailable');
  end if;
  if exists (select 1 from public.organization_members where organization_id = p_organization_id and user_id = p_user_id) then
    return jsonb_build_object('ok', false, 'code', 'member_exists');
  end if;
  if org.seats_used >= org.seats_purchased then
    return jsonb_build_object('ok', false, 'code', 'seats_full');
  end if;
  insert into public.organization_members (organization_id, user_id, role, invited_at)
    values (p_organization_id, p_user_id, p_role, now()) returning * into member;
  update public.organizations set seats_used = seats_used + 1 where id = p_organization_id;
  return jsonb_build_object('ok', true, 'organization_id', p_organization_id, 'user_id', p_user_id, 'role', p_role, 'seats_used', org.seats_used + 1);
end;
$$;
revoke all on function public.avint_claim_organization_seat(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.avint_claim_organization_seat(uuid, uuid, text) to service_role;

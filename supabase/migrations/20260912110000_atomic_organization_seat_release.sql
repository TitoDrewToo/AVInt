create or replace function public.avint_release_organization_seat(
  p_organization_id uuid,
  p_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  org public.organizations;
  member public.organization_members;
begin
  select * into org from public.organizations where id = p_organization_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'organization_not_found'); end if;
  select * into member from public.organization_members where organization_id = p_organization_id and user_id = p_user_id and active = true for update;
  if not found or member.role = 'owner' then return jsonb_build_object('ok', false, 'code', 'member_not_removable'); end if;
  update public.organization_members set active = false, removed_at = now() where organization_id = p_organization_id and user_id = p_user_id;
  update public.organizations set seats_used = greatest(0, seats_used - 1) where id = p_organization_id;
  return jsonb_build_object('ok', true, 'organization_id', p_organization_id, 'user_id', p_user_id, 'seats_used', greatest(0, org.seats_used - 1));
end;
$$;

revoke all on function public.avint_release_organization_seat(uuid, uuid) from public, anon, authenticated;
grant execute on function public.avint_release_organization_seat(uuid, uuid) to service_role;

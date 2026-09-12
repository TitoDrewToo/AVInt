alter table public.organization_members add column invitation_expires_at timestamptz;
-- Pending legacy invitations get a finite review window; accepted seats unaffected.
update public.organization_members set invitation_expires_at=now()+interval '7 days'
  where accepted_at is null and active;

create or replace function public.avint_manage_organization_member(
  p_organization_id uuid,p_actor_user_id uuid,p_user_id uuid,p_action text,p_role text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare org public.organizations%rowtype; member public.organization_members%rowtype; v_action text;
begin
  select * into org from public.organizations where id=p_organization_id for update;
  if not found or org.status <> 'active' then return jsonb_build_object('ok',false,'code','organization_unavailable'); end if;
  if p_actor_user_id is null or p_user_id is null or coalesce(p_action,'') not in ('invite','remove','accept') then
    return jsonb_build_object('ok',false,'code','invalid_input'); end if;
  if p_action <> 'accept' and not exists (
    select 1 from public.organization_members where organization_id=p_organization_id and user_id=p_actor_user_id
      and active and accepted_at is not null and accepted_at<=now() and role in ('owner','admin')
  ) then
    insert into public.collaboration_audit_events(actor_user_id,organization_id,action,outcome)
      values(p_actor_user_id,p_organization_id,'manage','denied');
    return jsonb_build_object('ok',false,'code','forbidden');
  end if;
  select * into member from public.organization_members where organization_id=p_organization_id and user_id=p_user_id for update;
  if p_action='accept' then
    if p_actor_user_id<>p_user_id or not coalesce(member.active,false) or member.accepted_at is not null
      or member.invitation_expires_at is null or member.invitation_expires_at<=now() then
      return jsonb_build_object('ok',false,'code','invitation_unavailable'); end if;
    update public.organization_members set accepted_at=now() where organization_id=p_organization_id and user_id=p_user_id;
    v_action:='accept';
  elsif p_action='invite' then
    if coalesce(p_role,'') not in ('admin','editor','reviewer','viewer') then return jsonb_build_object('ok',false,'code','invalid_role'); end if;
    if coalesce(member.active,false) then return jsonb_build_object('ok',false,'code','member_exists'); end if;
    if org.seats_used>=org.seats_purchased then return jsonb_build_object('ok',false,'code','seats_full'); end if;
    insert into public.organization_members(organization_id,user_id,role,active,invited_at,invitation_expires_at)
      values(p_organization_id,p_user_id,p_role,true,now(),now()+interval '7 days')
      on conflict(organization_id,user_id) do update set role=excluded.role,active=true,invited_at=excluded.invited_at,
        invitation_expires_at=excluded.invitation_expires_at,accepted_at=null,removed_at=null,evidence_allowed=false,export_allowed=false;
    update public.organizations set seats_used=seats_used+1 where id=p_organization_id;
    v_action:='invite';
  else
    if not coalesce(member.active,false) or member.role='owner' then return jsonb_build_object('ok',false,'code','member_not_removable'); end if;
    update public.organization_members set active=false,removed_at=now(),accepted_at=null,evidence_allowed=false,export_allowed=false
      where organization_id=p_organization_id and user_id=p_user_id;
    update public.organizations set seats_used=greatest(0,seats_used-1) where id=p_organization_id;
    v_action:='revoke';
  end if;
  insert into public.collaboration_audit_events(actor_user_id,organization_id,action,outcome,metadata)
    values(p_actor_user_id,p_organization_id,v_action,'completed',jsonb_build_object('member_user_id',p_user_id));
  return jsonb_build_object('ok',true,'organization_id',p_organization_id,'user_id',p_user_id,
    'seats_used',(select seats_used from public.organizations where id=p_organization_id));
end;
$$;
revoke all on function public.avint_manage_organization_member(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.avint_manage_organization_member(uuid,uuid,uuid,text,text) to service_role;
-- Disable old actor-less administration entry points; new route must be deployed
-- with this migration. Collaboration remains release-gated throughout.
revoke all on function public.avint_claim_organization_seat(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.avint_release_organization_seat(uuid,uuid) from public,anon,authenticated,service_role;
-- API service role can append/read audit events but cannot rewrite or delete them.
-- Referential SET NULL on account erasure is still performed by FK owner triggers.
revoke all on public.collaboration_audit_events from public,anon,authenticated,service_role;
grant select,insert on public.collaboration_audit_events to service_role;

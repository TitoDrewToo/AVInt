import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    create table auth.users(id uuid primary key);create table public.firms(id uuid primary key);
    create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end;$$;`)
  for (const file of ['20260912090000_collaboration_foundation.sql','20260912103000_atomic_organization_seat_claim.sql','20260912110000_atomic_organization_seat_release.sql','20260912140000_atomic_membership_administration.sql']) await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'))
  const [org,owner,admin,buddy] = [1,2,3,4].map(n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`)
  await db.query('insert into auth.users values($1),($2),($3)',[owner,admin,buddy])
  await db.query("insert into organizations(id,name,slug,seats_purchased,seats_used) values($1,'Test','test',3,1)",[org])
  await db.query("insert into organization_members(organization_id,user_id,role,accepted_at) values($1,$2,'owner',now())",[org,owner])
  const call=async(actor,user,action,role=null)=>(await db.query('select avint_manage_organization_member($1,$2,$3,$4,$5) result',[org,actor,user,action,role])).rows[0].result
  assert.equal((await call(owner,admin,'invite','admin')).ok,true)
  assert.equal((await call(admin,buddy,'invite','editor')).code,'forbidden')
  assert.equal((await call(admin,admin,'accept')).ok,true)
  assert.equal((await call(admin,buddy,'invite','editor')).ok,true)
  assert.equal((await call(buddy,buddy,'accept')).ok,true)
  await db.query('update organization_members set evidence_allowed=true,export_allowed=true where user_id=$1',[buddy])
  assert.equal((await call(admin,buddy,'remove')).ok,true)
  assert.equal((await call(admin,buddy,'invite','viewer')).ok,true)
  const reinvited=(await db.query('select accepted_at,evidence_allowed,export_allowed,removed_at from organization_members where user_id=$1',[buddy])).rows[0]
  assert.deepEqual(reinvited,{accepted_at:null,evidence_allowed:false,export_allowed:false,removed_at:null})
  await db.query("update organization_members set invitation_expires_at=now()-interval '1 second' where user_id=$1",[buddy])
  assert.equal((await call(buddy,buddy,'accept')).code,'invitation_unavailable')
  assert.equal((await call(admin,owner,'remove')).code,'member_not_removable')
  await db.query("update organizations set status='paused' where id=$1",[org])
  assert.equal((await call(admin,buddy,'remove')).code,'organization_unavailable')
  await db.query("update organizations set status='active' where id=$1",[org])
  // Audit failure must roll back the seat/member mutation too.
  await db.exec(`create function public.fail_audit() returns trigger language plpgsql as $$begin raise exception 'Injected audit failure';end;$$;
    create trigger fail_audit before insert on collaboration_audit_events for each row execute function fail_audit();`)
  await assert.rejects(call(admin,buddy,'remove'),/Injected audit failure/)
  assert.equal((await db.query('select active from organization_members where user_id=$1',[buddy])).rows[0].active,true)
  assert.equal((await db.query('select seats_used from organizations where id=$1',[org])).rows[0].seats_used,3)
  const acl=(await db.query("select has_table_privilege('service_role','collaboration_audit_events','UPDATE') u,has_table_privilege('service_role','collaboration_audit_events','DELETE') d,has_table_privilege('service_role','collaboration_audit_events','INSERT') i")).rows[0]
  assert.deepEqual(acl,{u:false,d:false,i:true})
  console.log('Membership PostgreSQL tests passed: pending admin denied, acceptance, removal, reinvitation, expiry, paused org, audit rollback and ACLs')
} finally { await db.close() }

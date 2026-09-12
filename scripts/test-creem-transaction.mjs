// Run with a disposable @electric-sql/pglite module path as argv[2]. No live DB.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key,email text);
    create function public.get_user_id_by_email(p_email text) returns uuid language sql as
      'select id from auth.users where lower(email)=lower(p_email)';
    create table public.user_counter(id integer primary key,total_users integer);
    insert into user_counter values(1,0);
    create function public.increment_user_counter() returns void language sql as
      'update public.user_counter set total_users=total_users+1 where id=1';
    create function public.record_firm_seat_purchase(uuid,text,text,text,integer,integer) returns jsonb language sql as
      'select jsonb_build_object(''ok'',false)';
  `)
  const baseline = readFileSync('supabase/migrations/20260831120000_baseline_schema.sql','utf8')
  for (const name of ['subscriptions','gift_codes','processed_webhook_events']) {
    const sql = baseline.match(new RegExp(`CREATE TABLE public\\.${name} \\([\\s\\S]*?\\n\\);`))?.[0]
    assert.ok(sql, name)
    await db.exec(sql)
  }
  await db.exec(`alter table subscriptions add unique(user_id); alter table subscriptions add unique(email);
    alter table gift_codes add unique(code); alter table processed_webhook_events add primary key(provider,event_id);`)
  await db.exec(readFileSync('supabase/migrations/20260912130000_atomic_creem_effects.sql','utf8'))
  const call = async (id, type, effect) => (await db.query('select avint_apply_creem_event($1,$2,$3::jsonb) result',[id,type,JSON.stringify(effect)])).rows[0].result
  const count = async table => Number((await db.query(`select count(*) n from ${table}`)).rows[0].n)
  const effect = { action:'subscription',email:'buyer@example.com',status:'pro',plan:'monthly',period_end:'2026-10-12T00:00:00Z',product_id:'pro',customer_id:'cus_1',subscription_id:'sub_1',order_id:'ord_1',counter_key:'subscription:sub_1' }
  // Failure after subscription mutation must roll back the marker AND entitlement.
  await db.exec(`create or replace function public.increment_user_counter() returns void language plpgsql as $$begin raise exception 'Injected counter failure'; end;$$;`)
  await assert.rejects(call('evt_1','checkout.completed',effect), /Injected counter failure/)
  assert.equal(await count('subscriptions'),0)
  assert.equal(await count('processed_webhook_events'),0)
  assert.equal(await count('creem_effect_receipts'),0)
  await db.exec(`create or replace function public.increment_user_counter() returns void language sql as 'update public.user_counter set total_users=total_users+1 where id=1';`)
  assert.equal((await call('evt_1','checkout.completed',effect)).ok,true)
  assert.equal((await call('evt_1','checkout.completed',effect)).duplicate,true)
  await call('evt_2','subscription.active',{...effect,order_id:null})
  assert.equal((await db.query('select total_users from user_counter')).rows[0].total_users,1)
  assert.equal((await db.query('select lemonsqueezy_order_id from subscriptions')).rows[0].lemonsqueezy_order_id,'ord_1')
  const gift = { action:'gift',email:'buyer@example.com',code:'AVINT-TEST-TEST-TEST',order_id:'gift_1' }
  await call('gift_evt','checkout.completed',gift)
  await db.exec(`update gift_codes set status='redeemed'`)
  await call('gift_evt_2','checkout.completed',{...gift,code:'AVINT-OTHER-CODE-TEST'})
  assert.equal(await count('gift_codes'),1)
  assert.equal((await db.query('select status,duration_hours from gift_codes')).rows[0].status,'redeemed')
  assert.equal((await db.query('select duration_hours from gift_codes')).rows[0].duration_hours,24)
  const day = { ...effect, email:'day@example.com',plan:'day_pass',status:'day_pass',subscription_id:null,order_id:'day_1',counter_key:'order:day_1',period_end:null }
  await call('day_evt','checkout.completed',day)
  const dayEnd=(await db.query("select current_period_end from subscriptions where email='day@example.com'")).rows[0].current_period_end
  await call('day_evt_2','checkout.completed',day)
  assert.deepEqual((await db.query("select current_period_end from subscriptions where email='day@example.com'")).rows[0].current_period_end,dayEnd)
  await assert.rejects(call('bad_refund','refund.created',{action:'refund',order_id:'missing'}),/requires reconciliation/)
  assert.equal((await db.query("select count(*)::int n from processed_webhook_events where event_id='bad_refund'")).rows[0].n,0)
  await call('refund_1','refund.created',{action:'refund',order_id:'ord_1'})
  assert.equal((await db.query("select status from subscriptions where email='buyer@example.com'")).rows[0].status,'free')
  const acl = await db.query("select has_function_privilege('anon','public.avint_apply_creem_event(text,text,jsonb)','execute') anon, has_function_privilege('authenticated','public.avint_apply_creem_event(text,text,jsonb)','execute') authenticated, has_function_privilege('service_role','public.avint_apply_creem_event(text,text,jsonb)','execute') service")
  assert.deepEqual(acl.rows[0],{anon:false,authenticated:false,service:true})
  console.log('Creem isolated PostgreSQL transaction tests passed: rollback, retry, duplicate effects, gift state, refund failure, ACLs')
} finally { await db.close() }

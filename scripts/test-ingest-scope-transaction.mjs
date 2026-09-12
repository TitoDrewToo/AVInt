import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
try {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    create table auth.users(id uuid primary key);create table public.files(id uuid primary key);
    create function public.set_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();return new;end;$$;`)
  for (const file of ['20260906030000_mcp_ingest_batches.sql','20260906030100_fix_ingest_batch_claim_ambiguity.sql','20260912133000_ingest_batch_scope.sql','20260912134000_ingest_claim_returned_lease.sql']) await db.exec(readFileSync(`supabase/migrations/${file}`,'utf8'))
  const owner='00000000-0000-4000-8000-000000000001', actor='00000000-0000-4000-8000-000000000002', workflow='00000000-0000-4000-8000-000000000003', folder='00000000-0000-4000-8000-000000000004'
  await db.query('insert into auth.users values($1),($2)',[owner,actor])
  const items=JSON.stringify([{item_index:0,input_hash:'hash',filename:'test.csv',mime_type:'text/csv',byte_size:1}])
  const claim=(key,a=actor,w=workflow,f=folder)=>db.query('select * from avint_claim_scoped_ingest_batch($1,$2,$3,$4::jsonb,$5,$6,$7)',[owner,key,'hash',items,a,w,f])
  const first=(await claim('batch-a')).rows[0]
  assert.equal(first.claimed,true)
  const stored = (await db.query('select lease_token,status from ingest_batch_items where id=$1',[first.item_id])).rows[0]
  assert.ok(stored.lease_token,'Database mutation did assign the lease')
  assert.equal(stored.status,'uploading')
  assert.ok(first.lease_token,'A claimed item must return the newly assigned lease')
  assert.equal(first.item_status,'uploading')
  assert.equal((await claim('batch-a')).rows[0].claimed,false)
  await assert.rejects(claim('batch-a',owner),/different submission scope/)
  await assert.rejects(claim('batch-a',actor,folder,folder),/different submission scope/)
  await assert.rejects(claim('batch-a',actor,workflow,workflow),/different submission scope/)
  await db.query('select * from avint_claim_ingest_batch($1,$2,$3,$4::jsonb)',[owner,'legacy','hash',items])
  await assert.rejects(claim('legacy'),/different submission scope/)
  await claim('legacy',owner,null,null)
  console.log('Ingest scope PostgreSQL tests passed: scoped retries, legacy isolation, valid leases')
} finally { await db.close() }

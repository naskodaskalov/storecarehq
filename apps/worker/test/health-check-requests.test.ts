import { test, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { freshDb, seedStore } from './helpers.ts';
import { executeScan, processHealthCheckRequests, scanOutcome, SCAN_PHASES } from '../src/health-check-requests.ts';
import { withStoreLock } from '../src/store-lock.ts';

const db = await freshDb();
after(async () => { if (db) await db.drop(); });
beforeEach(async () => { if (db) await db.pool.query('delete from public.health_check_requests'); });
const options = { skip: !db };
async function setup(over: Record<string,unknown> = {}) {
  const store = await seedStore(db!.pool,over);
  const user = randomUUID();
  await db!.pool.query('insert into auth.users(id,email) values($1,$2)',[user,`${user}@example.com`]);
  await db!.pool.query('insert into public.memberships(agency_id,user_id) values($1,$2)',[store.agency_id,user]);
  return { store,user };
}
async function asUser<T>(user: string, fn: (client: pg.PoolClient) => Promise<T>) {
  const c = await db!.pool.connect();
  try {
    await c.query('begin'); await c.query('set local role authenticated');
    await c.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
    const value = await fn(c); await c.query('commit'); return value;
  } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
}
async function request(user: string, store: string) {
  return asUser(user,async c => (await c.query('select public.request_health_check($1) as id',[store])).rows[0].id as string);
}
async function scan(store: string) { return (await db!.pool.query('select * from public.health_check_requests where store_id=$1 order by requested_at desc limit 1',[store])).rows[0]; }
async function running(store: string) {
  return (await db!.pool.query(`update public.health_check_requests set status='running',attempts=1,lease_token=gen_random_uuid(),lease_until=now()+interval '15 minutes' where store_id=$1 returning *`,[store])).rows[0];
}
const fakeTasks = (calls: string[], fail?: string) => Object.fromEntries(SCAN_PHASES.map(phase => [phase,async () => {
  calls.push(phase); if (phase===fail) throw new Error('private provider credential');
}])) as unknown as Parameters<typeof executeScan>[2];

test('scan outcome never treats missing checks as a completed run', () => {
  assert.equal(scanOutcome({}),'failed');
  assert.equal(scanOutcome({ uptime: { status: 'completed' } }),'partial');
});

test('adding a store atomically queues exactly one initial scan',options,async () => {
  const { store } = await setup();
  const row = await scan(store.id);
  assert.equal(row.source,'initial'); assert.equal(row.status,'queued'); assert.equal(row.agency_id,store.agency_id);
  const c=await db!.pool.connect();
  try {
    await c.query('begin');
    const {rows:[other]}=await c.query("insert into public.stores(agency_id,name,public_url) values($1,'Temporary','https://example.com') returning id",[store.agency_id]);
    assert.equal((await c.query('select count(*)::int as n from public.health_check_requests where store_id=$1',[other.id])).rows[0].n,1);
    await c.query('rollback');
    assert.equal((await c.query('select count(*)::int as n from public.health_check_requests where store_id=$1',[other.id])).rows[0].n,0);
  } finally { await c.query('rollback');c.release(); }
});

test('members can read their scan status but cannot read lease tokens, write status, or use other agencies',options,async () => {
  const a=await setup();const b=await setup();
  const rows=await asUser(a.user,async c => (await c.query('select store_id,status from public.health_check_requests')).rows);
  assert.equal(rows.length,1);assert.equal(rows[0].store_id,a.store.id);
  await assert.rejects(asUser(a.user,c=>c.query('select lease_token from public.health_check_requests')),/permission denied/);
  await assert.rejects(asUser(a.user,c=>c.query("update public.health_check_requests set status='completed'")),/permission denied/);
  await assert.rejects(request(a.user,b.store.id),/Store unavailable/);
  const c=await db!.pool.connect();
  try { await c.query('begin');await c.query('set local role anon');await assert.rejects(c.query('select public.request_health_check($1)',[a.store.id]),/permission denied/); }
  finally { await c.query('rollback');c.release(); }
});

test('a signed-in store insert queues its first scan without access to the private dispatcher',options,async()=>{
  const {store,user}=await setup();
  const id=await asUser(user,async c=>(await c.query("insert into public.stores(agency_id,name,public_url) values($1,'Second store','https://example.com') returning id",[store.agency_id])).rows[0].id);
  const row=await scan(id);assert.equal(row.source,'initial');assert.equal(row.agency_id,store.agency_id);
  await assert.rejects(asUser(user,c=>c.query('select storecare_ops.dispatch_health_checks()')),/permission denied/);
});

test('concurrent repeated clicks reuse one scan; cooldown is enforced after completion',options,async () => {
  const {store,user}=await setup();
  await db!.pool.query("update public.health_check_requests set status='completed',requested_at=now()-interval '10 minutes' where store_id=$1",[store.id]);
  const ids=await Promise.all([request(user,store.id),request(user,store.id),request(user,store.id)]);
  assert.equal(new Set(ids).size,1);
  assert.equal((await db!.pool.query("select count(*)::int as n from public.health_check_requests where store_id=$1 and status='queued'",[store.id])).rows[0].n,1);
  await db!.pool.query("update public.health_check_requests set status='completed' where id=$1",[ids[0]]);
  await assert.rejects(request(user,store.id),/five minutes/);
});

test('paused and lapsed agencies cannot request a scan, even when a request already exists',options,async () => {
  const {store,user}=await setup();
  await db!.pool.query("update public.stores set status='paused' where id=$1",[store.id]);
  await assert.rejects(request(user,store.id),/Resume monitoring/);
  await db!.pool.query("update public.stores set status='active' where id=$1",[store.id]);
  await db!.pool.query("update public.agencies set plan='trial',subscription_status=null,trial_ends_at=now()-interval '1 day' where id=$1",[store.agency_id]);
  await assert.rejects(request(user,store.id),/active plan/);
});

test('provider failure produces a partial result; other checks continue and checkout needs consent',options,async () => {
  const {store}=await setup();const calls:string[]=[];
  await executeScan(db!.pool,await running(store.id),fakeTasks(calls,'speed'));
  const row=await scan(store.id);
  assert.equal(row.status,'partial');assert.deepEqual(calls,['uptime','storefront','speed','site']);
  assert.equal(row.results.checkout.status,'skipped');assert.equal(row.results.speed.status,'failed');
  assert.ok(!JSON.stringify(row.results).includes('credential'));assert.ok(row.finished_at);
});

test('checkout requires devices and a usable product as well as consent',options,async () => {
  const {store}=await setup({checkout_consent_at:new Date(),checkout_mobile:true,checkout_desktop:false});
  const calls:string[]=[];await executeScan(db!.pool,await running(store.id),fakeTasks(calls));
  assert.equal((await scan(store.id)).results.checkout.status,'skipped');assert.ok(!calls.includes('checkout'));
  await db!.pool.query("update public.stores set checkout_product_handle='candle' where id=$1",[store.id]);
  await db!.pool.query("update public.health_check_requests set status='queued',results='{}' where store_id=$1",[store.id]);
  await executeScan(db!.pool,await running(store.id),fakeTasks(calls));
  assert.ok(calls.includes('checkout'));assert.equal((await scan(store.id)).status,'completed');
});

test('an expired lease resumes saved progress; an exhausted lease ends visibly',options,async () => {
  const {store}=await setup();const calls:string[]=[];
  await db!.pool.query(`update public.health_check_requests set status='running',attempts=1,lease_until=now()-interval '1 minute',results='{"uptime":{"status":"completed"}}' where store_id=$1`,[store.id]);
  await processHealthCheckRequests(db!.pool,1,(c,s)=>executeScan(c,s,fakeTasks(calls)));
  assert.ok(!calls.includes('uptime'));assert.equal((await scan(store.id)).status,'completed');assert.equal((await scan(store.id)).attempts,2);
  await db!.pool.query("update public.health_check_requests set status='running',lease_until=now()-interval '1 minute' where store_id=$1",[store.id]);
  await processHealthCheckRequests(db!.pool,1,async()=>{throw new Error('must not run');});
  assert.equal((await scan(store.id)).status,'failed');
});

test('concurrent workers execute one request once',options,async () => {
  const {store}=await setup();let count=0;
  const execute: Parameters<typeof processHealthCheckRequests>[2]=async(c,s)=>{
    count++;await c.query("update public.health_check_requests set status='completed',finished_at=now() where id=$1 and lease_token=$2",[s.id,s.lease_token]);
  };
  await Promise.all([processHealthCheckRequests(db!.pool,1,execute),processHealthCheckRequests(db!.pool,1,execute)]);
  assert.equal(count,1);assert.equal((await scan(store.id)).status,'completed');
});

test('a scheduled check lock defers manual work without consuming an attempt',options,async () => {
  const {store}=await setup();let release!:()=>void;let entered!:()=>void;
  const ready=new Promise<void>(r=>{entered=r;});const hold=new Promise<void>(r=>{release=r;});
  const scheduled=withStoreLock(db!.pool,store.id,async()=>{entered();await hold;});
  await ready;
  try { await processHealthCheckRequests(db!.pool,1,async()=>{assert.fail('overlapping scan');}); }
  finally { release();await scheduled; }
  const row=await scan(store.id);assert.equal(row.status,'queued');assert.equal(row.attempts,0);
});

test('a stale worker cannot save over a newer lease, and eligibility changes stop a scan',options,async () => {
  const {store}=await setup();const row=await running(store.id);
  await db!.pool.query('update public.health_check_requests set lease_token=gen_random_uuid() where id=$1',[row.id]);
  await assert.rejects(executeScan(db!.pool,row,fakeTasks([])),/lease no longer owned/);
  await db!.pool.query("update public.stores set status='paused' where id=$1",[store.id]);
  await executeScan(db!.pool,await running(store.id),fakeTasks([]));
  assert.equal((await scan(store.id)).status,'failed');
});

test('dispatch failure cannot roll back a new request or expose private errors',options,async () => {
  await db!.pool.query("create function storecare_ops.dispatch_monitor() returns bigint language plpgsql as $$ begin raise exception 'private dispatch credential'; end $$");
  await db!.pool.query('update storecare_ops.health_check_dispatch_state set enabled=true,last_attempt_at=null');
  try { const {store}=await setup();assert.equal((await scan(store.id)).status,'queued'); }
  finally { await db!.pool.query('update storecare_ops.health_check_dispatch_state set enabled=false'); }
});

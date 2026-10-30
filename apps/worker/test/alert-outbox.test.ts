import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { freshDb, seedStore } from './helpers.ts';
import { notify } from '../src/notify.ts';
import { deliverAlerts } from '../src/alert-outbox.ts';
import { defaultSenders, DeliveryError } from '../src/alert-transport.ts';
import { createPool } from '../src/db.ts';

const db = await freshDb();
after(async () => { if (db) await db.drop(); });
const noSend = { email: async () => {}, slack: async () => {} };
async function setup() {
  const store = await seedStore(db!.pool);
  const { rows: [route] } = await db!.pool.query(`insert into public.alert_routes(agency_id,store_id,channel,target)
    values ($1,$2,'email','ops@example.com') returning id`, [store.agency_id, store.id]);
  return { store, route };
}
const alert = (key = randomUUID()) => [{ key, severity: 'incident' as const, title: 'Store is down', body: 'Two checks failed.' }];
async function row(storeId: string) {
  return (await db!.pool.query('select * from public.alert_deliveries where store_id=$1', [storeId])).rows[0];
}
async function due(storeId: string) {
  await db!.pool.query("update public.alert_deliveries set next_attempt_at=now()-interval '1 minute' where store_id=$1", [storeId]);
}

test('missing email configuration fails rather than reporting success', async () => {
  const old = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  try { await assert.rejects(defaultSenders.email('test@example.com','Test','Test'), /not configured/); }
  finally { if (old === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY=old; }
});

test('production pool enables atomic alerts before the first query', { skip: !db }, async () => {
  const pool=createPool(process.env.TEST_DATABASE_URL);
  try { assert.equal((await pool.query("select current_setting('storecare.alert_outbox',true) as flag")).rows[0].flag,'on'); }
  finally { await pool.end(); }
});

test('incident/change writes and queued alerts commit or roll back together, with legacy workers unchanged', { skip: !db }, async () => {
  const {store}=await setup();
  const client=await db!.pool.connect();
  try {
    await client.query('begin');
    await client.query("set local storecare.alert_outbox='on'");
    const {rows:[incident]}=await client.query("insert into public.incidents(store_id,agency_id,kind) values($1,$2,'down') returning id",[store.id,store.agency_id]);
    assert.equal((await client.query('select count(*)::int as n from public.alert_deliveries where store_id=$1',[store.id])).rows[0].n,1);
    await client.query('update public.incidents set resolved_at=now() where id=$1',[incident.id]);
    await client.query('update public.incidents set resolved_at=now() where id=$1',[incident.id]);
    await client.query("update public.alert_routes set min_severity='risky' where store_id=$1",[store.id]);
    await client.query("insert into public.changes(store_id,agency_id,kind,summary,risky) values($1,$2,'theme_published','New theme',true)",[store.id,store.agency_id]);
    assert.equal((await client.query('select count(*)::int as n from public.alert_deliveries where store_id=$1',[store.id])).rows[0].n,3);
    await client.query('rollback');
    assert.equal((await db!.pool.query('select count(*)::int as n from public.alert_deliveries where store_id=$1',[store.id])).rows[0].n,0);
    await client.query("insert into public.incidents(store_id,agency_id,kind) values($1,$2,'down')",[store.id,store.agency_id]);
    assert.equal((await db!.pool.query('select count(*)::int as n from public.alert_deliveries where store_id=$1',[store.id])).rows[0].n,0);
  } finally {await client.query('rollback');client.release();}
});

test('failed sends survive a later pass and reuse the email idempotency key', { skip: !db }, async () => {
  const { store } = await setup();
  let firstKey: string | undefined;
  assert.equal(await notify(db!.pool,store,alert(), { ...noSend, email: async (_to,_s,_b,key) => {
    firstKey=key; throw new Error('secret webhook and API key');
  } }),0);
  const first=await row(store.id);
  assert.equal(first.status,'retry'); assert.equal(first.attempts,1);
  assert.ok(!first.last_error.includes('secret'));
  assert.ok(first.next_attempt_at.getTime()>Date.now());
  await due(store.id);
  assert.equal(await deliverAlerts(db!.pool,{...noSend,email:async (_to,_s,_b,key)=>{assert.equal(key,firstKey);}},[first.id]),1);
  assert.equal((await row(store.id)).status,'sent');
});

test('the same event and overlapping routes send once per destination', { skip: !db }, async () => {
  const { store }=await setup();
  await db!.pool.query("insert into public.alert_routes(agency_id,channel,target) values($1,'email','ops@example.com')",[store.agency_id]);
  const a=alert();let count=0;const senders={...noSend,email:async()=>{count++;}};
  await notify(db!.pool,store,a,senders);await notify(db!.pool,store,a,senders);
  assert.equal(count,1);
});

test('concurrent dispatchers claim each delivery once', { skip: !db }, async () => {
  const { store }=await setup();
  await notify(db!.pool,store,alert(),{...noSend,email:async()=>{throw new Error('offline');}});
  const d=await row(store.id);await due(store.id);let count=0;
  const senders={...noSend,email:async()=>{count++;await new Promise(r=>setTimeout(r,30));}};
  await Promise.all([deliverAlerts(db!.pool,senders,[d.id]),deliverAlerts(db!.pool,senders,[d.id])]);
  assert.equal(count,1);
});

test('removed routes cancel retries; permanent errors stop; stale leases recover', { skip: !db }, async () => {
  const { store,route }=await setup();
  await notify(db!.pool,store,alert(),{...noSend,email:async()=>{throw new Error('offline');}});
  await db!.pool.query('delete from public.alert_routes where id=$1',[route.id]);
  const d=await row(store.id);await due(store.id);
  assert.equal(await deliverAlerts(db!.pool,noSend,[d.id]),0);assert.equal((await row(store.id)).status,'cancelled');
  const next=await setup();
  await notify(db!.pool,next.store,alert(),{...noSend,email:async()=>{throw new DeliveryError('Invalid recipient.',true);}});
  assert.equal((await row(next.store.id)).status,'failed');
  const recovered=await setup();
  await notify(db!.pool,recovered.store,alert(),{...noSend,email:async()=>{throw new Error('offline');}});
  await db!.pool.query("update public.alert_deliveries set status='sending',lease_token=gen_random_uuid() where store_id=$1",[recovered.store.id]);
  await due(recovered.store.id);
  assert.equal(await deliverAlerts(db!.pool,noSend,[(await row(recovered.store.id)).id]),1);
});

test('six failures exhaust retries; messages older than the idempotency window are not sent', { skip: !db }, async () => {
  const {store}=await setup();const fail={...noSend,email:async()=>{throw new Error('offline');}};
  await notify(db!.pool,store,alert(),fail);const d=await row(store.id);
  for(let i=1;i<6;i++){await due(store.id);await deliverAlerts(db!.pool,fail,[d.id]);}
  assert.equal((await row(store.id)).status,'failed');assert.equal((await row(store.id)).attempts,6);
  const old=await setup();await notify(db!.pool,old.store,alert(),fail);
  await db!.pool.query("update public.alert_deliveries set created_at=now()-interval '24 hours' where store_id=$1",[old.store.id]);
  await due(old.store.id);let called=false;
  await deliverAlerts(db!.pool,{...noSend,email:async()=>{called=true;}},[(await row(old.store.id)).id]);
  assert.equal(called,false);assert.equal((await row(old.store.id)).status,'failed');
});

test('members can read only their agency status and cannot read targets or alter delivery state', { skip: !db }, async () => {
  const {store}=await setup();await notify(db!.pool,store,alert(),noSend);
  const other=await setup();await notify(db!.pool,other.store,alert(),noSend);
  const user=randomUUID();
  await db!.pool.query('insert into auth.users(id) values($1)',[user]);
  await db!.pool.query("insert into public.memberships(agency_id,user_id,role) values($1,$2,'owner')",[store.agency_id,user]);
  const own=await row(store.id); const foreign=await row(other.store.id);
  await db!.pool.query("update public.alert_deliveries set status='failed' where id=any($1::uuid[])",[[own.id,foreign.id]]);
  const client=await db!.pool.connect();
  try {
    await client.query('begin');await client.query('set local role authenticated');
    await client.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
    const {rows}=await client.query('select id,store_id,status from public.alert_deliveries');
    assert.equal(rows.length,1);assert.equal(rows[0].store_id,store.id);
    await client.query('savepoint privileges');
    await assert.rejects(client.query('select target from public.alert_deliveries'),/permission denied/);
    await client.query('rollback to savepoint privileges');
    await assert.rejects(client.query("update public.alert_deliveries set status='sent'"),/permission denied/);
    await client.query('rollback to savepoint privileges');
    await assert.rejects(client.query('select public.retry_alert_delivery($1)',[foreign.id]),/not found/);
    await client.query('rollback to savepoint privileges');
    await client.query('select public.retry_alert_delivery($1)',[own.id]);
    assert.equal((await client.query("select count(*)::int as n from public.alert_deliveries where status='pending'")).rows[0].n,1);
    await assert.rejects(client.query('select public.retry_alert_delivery($1)',[own.id]),/Only failed/);
  } finally {await client.query('rollback');client.release();}
});

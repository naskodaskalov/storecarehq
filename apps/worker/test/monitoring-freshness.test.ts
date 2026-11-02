import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, seedStore } from './helpers.ts';

const db = await freshDb();
after(async () => { if (db) await db.drop(); });
const options = { skip: !db };

async function freshness() {
  return (await db!.pool.query('select public.monitoring_freshness() as f')).rows[0].f;
}

test('monitoring freshness counts eligible stores without a recent uptime check', options, async () => {
  const old = "now() - interval '3 hours'";
  const a = await seedStore(db!.pool);
  const b = await seedStore(db!.pool);
  await db!.pool.query(`update public.stores set created_at = ${old} where id = any($1)`, [[a.id, b.id]]);
  await db!.pool.query('delete from public.health_check_requests');
  await db!.pool.query("insert into public.uptime_checks(store_id, agency_id, checked_at, ok) values ($1, $2, now() - interval '10 minutes', true)", [a.id, a.agency_id]);
  await db!.pool.query("insert into public.uptime_checks(store_id, agency_id, checked_at, ok) values ($1, $2, now() - interval '2 hours', true)", [b.id, b.agency_id]);
  let f = await freshness();
  assert.equal(f.eligible, 2);
  assert.equal(f.stale, 1);
  assert.equal(f.last_check_minutes, 10);

  // Paused stores, brand-new stores and lapsed agencies are not expected to have checks.
  await db!.pool.query("update public.stores set status = 'paused' where id = $1", [b.id]);
  const fresh = await seedStore(db!.pool);
  await db!.pool.query('delete from public.health_check_requests where store_id = $1', [fresh.id]);
  f = await freshness();
  assert.equal(f.eligible, 1);
  assert.equal(f.stale, 0);

  await db!.pool.query("insert into public.health_check_requests(store_id, agency_id, source, requested_at) values ($1, $2, 'manual', now() - interval '45 minutes')", [a.id, a.agency_id]);
  assert.equal((await freshness()).waiting_health_checks, 1);
});

test('only the service role can read monitoring freshness', options, async () => {
  for (const role of ['anon', 'authenticated']) {
    const c = await db!.pool.connect();
    try {
      await c.query('begin');
      await c.query(`set local role ${role}`);
      await assert.rejects(c.query('select public.monitoring_freshness()'), /permission denied/);
    } finally {
      await c.query('rollback');
      c.release();
    }
  }
});

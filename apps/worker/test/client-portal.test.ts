import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, seedStore } from './helpers.ts';

const db = await freshDb();
after(async () => { if (db) await db.drop(); });
const options = { skip: !db };

const TOKEN = 'ab'.repeat(32);

/** Runs fn as the given role in a transaction that is always rolled back. */
async function as<T>(role: string, fn: (q: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, any>[] }>) => Promise<T>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const c = await db!.pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${role}`);
    return await fn((sql, values) => c.query(sql, values));
  } finally {
    await c.query('rollback');
    c.release();
  }
}

async function portalStore() {
  const store = await seedStore(db!.pool, { name: `Juniper ${Math.random()}`, public_url: `https://j${Math.floor(Math.random() * 1e9)}.com`, portal_token: null });
  const q = (sql: string, v: unknown[] = []) => db!.pool.query(sql, v);
  const token = Math.random().toString(16).slice(2).padEnd(16, '0').repeat(4).slice(0, 64);
  await q('update public.stores set portal_token = $2, portal_enabled_at = now() where id = $1', [store.id, token]);
  await q(`insert into public.care_plans (store_id, agency_id, name, hours_included) values ($1, $2, 'Care Plan Growth', 10)`, [store.id, store.agency_id]);
  await q(`insert into public.work_entries (store_id, agency_id, minutes, title, client_text) values
    ($1, $2, 90, 'Internal title A', 'Launched the autumn homepage'),
    ($1, $2, 30, 'Fixed the menu', null)`, [store.id, store.agency_id]);
  await q(`insert into public.work_entries (store_id, agency_id, minutes, title, counts_to_plan) values ($1, $2, 45, 'Secret internal note', false)`, [store.id, store.agency_id]);
  await q(`insert into public.uptime_checks (store_id, agency_id, checked_at, ok, ms) values
    ($1, $2, now() - interval '1 hour', true, 300), ($1, $2, now() - interval '2 hours', false, null)`, [store.id, store.agency_id]);
  await q(`insert into public.incidents (store_id, agency_id, kind, cause, client_note) values ($1, $2, 'checkout', 'internal stack trace', 'Payment step is being fixed')`, [store.id, store.agency_id]);
  await q(`insert into public.reports (store_id, agency_id, period, status) values ($1, $2, '2026-10-01', 'approved'), ($1, $2, '2026-09-01', 'draft')`, [store.id, store.agency_id]);
  await q(`insert into public.alert_routes (agency_id, channel, target) values ($1, 'email', 'ops@northline.studio')`, [store.agency_id]);
  return { store, token };
}

test('the portal opens for anyone with the token and shows only client-facing data', options, async () => {
  const { token } = await portalStore();
  const p = await as('anon', async (q) => (await q('select public.public_store_portal($1) as p', [token])).rows[0].p);
  assert.equal(p.plan.name, 'Care Plan Growth');
  assert.equal(p.minutes_this_month, 120, 'only plan work counts');
  const texts = p.work.map((w: { text: string }) => w.text).sort();
  assert.deepEqual(texts, ['Fixed the menu', 'Launched the autumn homepage'], 'client text wins; non-plan work without client text is hidden');
  assert.equal(p.reports.length, 1, 'drafts are not listed');
  assert.equal(p.incidents[0].client_note, 'Payment step is being fixed');
  assert.ok(!JSON.stringify(p).includes('internal stack trace'), 'incident causes stay private');
  assert.ok(!JSON.stringify(p).includes('Secret internal note'));
  assert.ok(!JSON.stringify(p).includes('northline.studio'), 'no alert or contact addresses');
  assert.equal(p.uptime_days.reduce((a: number, d: { checks: number }) => a + d.checks, 0), 2);
});

test('wrong, short or disabled tokens return nothing', options, async () => {
  const { store, token } = await portalStore();
  await as('anon', async (q) => {
    assert.equal((await q('select public.public_store_portal($1) as p', ['cd'.repeat(32)])).rows[0].p, null);
    assert.equal((await q('select public.public_store_portal($1) as p', [token.slice(0, 40)])).rows[0].p, null);
    assert.equal((await q('select public.public_store_portal($1) as p', [null])).rows[0].p, null);
  });
  await db!.pool.query('update public.stores set portal_token = null where id = $1', [store.id]);
  await as('anon', async (q) => assert.equal((await q('select public.public_store_portal($1) as p', [token])).rows[0].p, null));
});

test('the portal closes when the agency has no active plan', options, async () => {
  const { store, token } = await portalStore();
  await db!.pool.query(`update public.agencies set subscription_status = 'canceled', trial_ends_at = now() - interval '1 day' where id = $1`, [store.agency_id]);
  await as('anon', async (q) => assert.equal((await q('select public.public_store_portal($1) as p', [token])).rows[0].p, null));
  await as('anon', async (q) => assert.rejects(q(`select public.submit_portal_request($1, 'Maya', 'maya@shop.com', 'Hi', null)`, [token]), /portal_not_found/));
});

test('a client request lands in the inbox and alerts the agency', options, async () => {
  const { store, token } = await portalStore();
  await as('anon', async (q) => {
    const id = (await q(`select public.submit_portal_request($1, ' Maya ', 'Maya@Shop.com', ' Add a gift-wrap option ', 'Before Friday please', 'urgent') as id`, [token])).rows[0].id;
    assert.ok(id);
  });
  // The anon transaction rolled back; submit again as a committed call through a definer to inspect rows.
  await db!.pool.query(`select public.submit_portal_request($1, 'Maya', 'maya@shop.com', 'Add a gift-wrap option', 'Before Friday please', 'urgent')`, [token]);
  const { rows: [r] } = await db!.pool.query('select * from public.requests where store_id = $1', [store.id]);
  assert.equal(r.subject, 'Add a gift-wrap option');
  assert.equal(r.from_email, 'maya@shop.com');
  assert.equal(r.source, 'portal');
  assert.equal(r.urgency, 'urgent');
  const { rows: alerts } = await db!.pool.query('select * from public.alert_deliveries where store_id = $1', [store.id]);
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].subject, /Urgent client request: Add a gift-wrap option/);
  assert.match(alerts[0].body, /app\.storecarehq\.com\/requests/);
  const p = (await db!.pool.query('select public.public_store_portal($1) as p', [token])).rows[0].p;
  assert.equal(p.requests[0].subject, 'Add a gift-wrap option');
  assert.ok(!('from_email' in p.requests[0]), 'requester emails are not shown on the shared page');
});

test('requests are validated and rate limited per store', options, async () => {
  const { token } = await portalStore();
  const send = (subject: string, email = 'a@b.co', urgency = 'normal') =>
    db!.pool.query(`select public.submit_portal_request($1, null, $2, $3, null, $4)`, [token, email, subject, urgency]);
  await assert.rejects(send('   '), /subject_required/);
  await assert.rejects(send('Hi', 'not-an-email'), /email_invalid/);
  await assert.rejects(send('x'.repeat(201)), /too_long/);
  await assert.rejects(send('Hi', 'a@b.co', 'asap'), /urgency_invalid/);
  for (let i = 0; i < 10; i++) await send(`Request ${i}`);
  await assert.rejects(send('One too many'), /rate_limited/);
});

test('browser roles cannot change portal tokens of other agencies or read requests directly', options, async () => {
  const { store } = await portalStore();
  await as('anon', async (q) => {
    await assert.rejects(q('select * from public.requests'), /permission denied/);
  });
  await as('authenticated', async (q) => {
    const { rows } = await q('select portal_token from public.stores where id = $1', [store.id]);
    assert.equal(rows.length, 0, 'RLS hides stores of other agencies');
    const res = await q(`update public.stores set portal_token = $2 where id = $1 returning id`, [store.id, TOKEN]);
    assert.equal(res.rows.length, 0);
  });
});

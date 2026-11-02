import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { freshDb } from './helpers.ts';

const db = await freshDb();
after(async () => { if (db) await db.drop(); });
const options = { skip: !db };

// Local midnight today and six days ago in Sofia, computed the same calendar way as the function (DST-safe).
const TZ = 'Europe/Sofia';
const MIDNIGHT = `(date_trunc('day', now() at time zone '${TZ}') at time zone '${TZ}')`;
const WEEK_START = `((date_trunc('day', now() at time zone '${TZ}') - interval '6 days') at time zone '${TZ}')`;

async function person(created: string, over: { confirmed?: boolean; deleted?: boolean; anonymous?: boolean; email?: string } = {}) {
  const id = randomUUID();
  await db!.pool.query(
    `insert into auth.users (id, email, created_at, email_confirmed_at, deleted_at, is_anonymous)
     values ($1, $2, ${created}, ${over.confirmed === false ? 'null' : created}, ${over.deleted ? 'now()' : 'null'}, $3)`,
    [id, over.email ?? `${id.slice(0, 8)}@example.com`, !!over.anonymous],
  );
  return id;
}

async function workspace(owner: string, created: string, fields: Record<string, unknown>) {
  const keys = Object.keys(fields);
  const { rows: [a] } = await db!.pool.query<{ id: string }>(
    `insert into public.agencies (${keys.join(',')}, created_at) values (${keys.map((_, i) => `$${i + 1}`).join(',')}, ${created}) returning id`,
    Object.values(fields),
  );
  await db!.pool.query("insert into public.memberships (agency_id, user_id, role) values ($1, $2, 'owner')", [a.id, owner]);
  return a.id;
}

async function store(agency: string, created: string, status = 'active') {
  await db!.pool.query(
    `insert into public.stores (agency_id, name, public_url, status, created_at) values ($1, 'Store', $2, $3, ${created})`,
    [agency, `https://${randomUUID().slice(0, 8)}.example.com`, status],
  );
}

async function metrics(tz = TZ) {
  return (await db!.pool.query('select public.admin_metrics($1) as m', [tz])).rows[0].m;
}

test('admin metrics count sign-ups, stores, workspaces and outreach by calendar day in the admin time zone', options, async () => {
  const today = await person(`${MIDNIGHT} + interval '1 minute'`, { email: 'newest@example.com' });
  const yesterday = await person(`${MIDNIGHT} - interval '1 minute'`, { email: 'yesterday@example.com' });
  const weekIn = await person(`${WEEK_START} + interval '1 minute'`);
  const weekOut = await person(`${WEEK_START} - interval '1 minute'`);
  await person("now() - interval '30 days'", { confirmed: false });
  await person('now()', { deleted: true });
  await person('now()', { anonymous: true });

  const a1 = await workspace(today, 'now()', { name: 'Northline', plan: 'agency', subscription_status: 'trialing', stripe_subscription_id: 'sub_1', current_period_end: '2030-01-01T00:00:00Z' });
  const a2 = await workspace(yesterday, `${MIDNIGHT} - interval '1 minute'`, { name: 'Ferro', plan: 'solo', subscription_status: 'active', stripe_subscription_id: 'sub_2', cancel_at_period_end: true });
  await workspace(weekIn, `${WEEK_START} + interval '1 minute'`, { name: 'Bloom', plan: 'trial' });
  const a4 = await workspace(weekOut, `${WEEK_START} - interval '1 minute'`, { name: 'Kite', plan: 'pro', subscription_status: 'past_due', stripe_subscription_id: 'sub_4' });
  // An ended subscription that the second person only belongs to as a member: their own workspace still leads.
  const { rows: [a5] } = await db!.pool.query<{ id: string }>("insert into public.agencies (name, plan, subscription_status, stripe_subscription_id, created_at) values ('Old Co', 'trial', 'canceled', 'sub_5', now() - interval '30 days') returning id");
  await db!.pool.query("insert into public.memberships (agency_id, user_id, role, created_at) values ($1, $2, 'member', now() - interval '60 days')", [a5.id, yesterday]);

  await store(a1, 'now()');
  await store(a1, "now() - interval '10 days'", 'paused');
  await store(a2, `${MIDNIGHT} - interval '1 minute'`, 'limited');
  await store(a4, `${WEEK_START} - interval '1 minute'`);

  const contact = (domain: string, sent: string, digest: string) => db!.pool.query(
    `insert into public.outreach_contacts (sent_at, sent_by, agency_name, agency_domain, agency_url, contact_email, subject, body_text, delivery, payload_digest)
     values (${sent}, 'admin@example.com', 'Agency', $1, $2, $3, 'Hello', 'Hi', 'accepted', $4)`,
    [domain, `https://${domain}/`, `hi@${domain}`, digest.repeat(64)],
  );
  await contact('north.example', 'now()', 'a');
  await contact('north.example', 'now()', 'b');
  await contact('south.example', "now() - interval '10 days'", 'c');

  const m = await metrics();
  assert.equal(m.timezone, TZ);
  assert.deepEqual(m.users, { today: 1, week: 3, total: 5, unconfirmed: 1 });
  assert.deepEqual(m.stores, { today: 1, week: 2, total: 4, active: 2, limited: 1, paused: 1 });
  assert.deepEqual(m.workspaces, { today: 1, week: 3, total: 5 });
  assert.deepEqual(m.outreach, { today: 2, week: 2, total: 3, agencies: 2 });
  assert.deepEqual(m.funnel, { signed_up: 5, confirmed: 4, workspace: 4, store: 3, trial: 3, paying: 1 });
  const { plans, ...subscriptions } = m.subscriptions;
  assert.deepEqual(subscriptions, { trialing: 1, active: 1, past_due: 1, cancelling: 1, ended: 1, no_card: 1 });
  assert.deepEqual(plans, [
    { status: 'active', plan: 'solo', cancelling: true, count: 1 },
    { status: 'past_due', plan: 'pro', cancelling: false, count: 1 },
    { status: 'trialing', plan: 'agency', cancelling: false, count: 1 },
  ]);

  const recent = m.recent_signups;
  assert.deepEqual(recent.map((r: { email: string }) => r.email).slice(0, 2), ['newest@example.com', 'yesterday@example.com']);
  assert.equal(recent.length, 5, 'deleted and anonymous users are left out');
  assert.equal(recent[0].workspace, 'Northline');
  assert.equal(recent[0].stores, 2);
  assert.ok(recent[0].trial_ends_at, 'trial end is shown while trialing');
  assert.equal(recent[1].workspace, 'Ferro', 'the workspace a person owns comes first');
  assert.equal(recent[1].trial_ends_at, null);
  assert.equal(recent[4].confirmed, false);
  assert.equal(recent[4].workspace, null);
  assert.equal(typeof m.monitoring.eligible, 'number');
});

test('only the service role can read admin metrics', options, async () => {
  for (const role of ['anon', 'authenticated']) {
    const c = await db!.pool.connect();
    try {
      await c.query('begin');
      await c.query(`set local role ${role}`);
      await assert.rejects(c.query("select public.admin_metrics('UTC')"), /permission denied/);
    } finally {
      await c.query('rollback');
      c.release();
    }
  }
  const c = await db!.pool.connect();
  try {
    await c.query('begin');
    await c.query('set local role service_role');
    assert.equal((await c.query("select public.admin_metrics('UTC') ->> 'timezone' as tz")).rows[0].tz, 'UTC');
  } finally {
    await c.query('rollback');
    c.release();
  }
});

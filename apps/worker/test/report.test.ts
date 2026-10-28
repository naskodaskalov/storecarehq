import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { monthPeriod } from '@storecare/reports';
import { draftMonthlyReport, loadMonthRows } from '../src/jobs/report.ts';
import { sendReportDigests } from '../src/tasks.ts';
import { freshDb, seedStore } from './helpers.ts';

const db = await freshDb();
const october = monthPeriod('2026-10');

describe('monthly report drafting (database)', { skip: !db && 'set TEST_DATABASE_URL' }, () => {
  const pool = db!?.pool;
  let store: { id: string; agency_id: string };

  before(async () => {
    store = await seedStore(pool, { created_at: '2026-09-15T00:00:00Z' });
    await pool.query(`insert into public.care_plans (store_id, agency_id, name, hours_included) values ($1, $2, 'Care Plan Growth', 10)`, [store.id, store.agency_id]);
    await pool.query(
      `insert into public.uptime_checks (store_id, agency_id, checked_at, ok, status, ms)
       select $1, $2, '2026-10-01T00:00:00Z'::timestamptz + n * interval '30 minutes', n <> 7, 200, 400 from generate_series(0, 99) n`,
      [store.id, store.agency_id],
    );
    await pool.query(
      `insert into public.work_entries (store_id, agency_id, work_date, minutes, title, client_text) values
        ($1, $2, '2026-10-02', 90, 'Theme', 'Launched the autumn homepage.'),
        ($1, $2, '2026-09-20', 60, 'Setup', null)`,
      [store.id, store.agency_id],
    );
  });
  after(() => db!.drop());

  test('loads the month as the web app would see it', async () => {
    const rows = await loadMonthRows(pool, store.id, october);
    assert.equal(rows!.store.name, 'Juniper & Ash');
    assert.equal(Number(rows!.uptime!.checks), 100);
    assert.equal(rows!.work.length, 1);
    assert.equal(Date.parse(rows!.store.created_at), Date.parse('2026-09-15T00:00:00Z'));
  });

  test('drafts once, with facts and a template summary, and marks it automatic', async () => {
    const r = await draftMonthlyReport(pool, store.id, october, { now: new Date('2026-11-01T05:00:00Z') });
    assert.ok(r.created);
    const { rows: [rep] } = await pool.query(`select * from public.reports where id = $1`, [r.reportId]);
    assert.equal(rep.status, 'draft');
    assert.equal(rep.summary_source, 'template');
    assert.ok(rep.auto_drafted_at);
    assert.ok(rep.share_token);
    assert.equal(rep.facts.storeName, 'Juniper & Ash');
    assert.equal(rep.facts.uptimePct, 99);
    assert.equal(rep.facts.work.hoursUsed, 1.5);
    assert.equal(rep.sections.recommendations, true);

    const again = await draftMonthlyReport(pool, store.id, october);
    assert.deepEqual(again, { created: false, reason: 'exists' });
  });

  test('never touches a report the agency already started', async () => {
    const nov = monthPeriod('2026-11');
    await pool.query(
      `insert into public.reports (store_id, agency_id, period, status, summary_text) values ($1, $2, $3, 'approved', 'Hand written')`,
      [store.id, store.agency_id, nov.start],
    );
    assert.deepEqual(await draftMonthlyReport(pool, store.id, nov), { created: false, reason: 'exists' });
    const { rows: [rep] } = await pool.query(`select status, summary_text, auto_drafted_at from public.reports where store_id = $1 and period = $2`, [store.id, nov.start]);
    assert.deepEqual(rep, { status: 'approved', summary_text: 'Hand written', auto_drafted_at: null });
  });

  test('skips months before the store was added', async () => {
    assert.deepEqual(await draftMonthlyReport(pool, store.id, monthPeriod('2026-08')), { created: false, reason: 'store too new' });
  });

  test('one digest per agency to its email and Slack routes, whatever their alert level', async () => {
    await pool.query(
      `insert into public.alert_routes (agency_id, channel, target, min_severity) values
        ($1, 'email', 'ops@northline.studio', 'incident'), ($1, 'slack', 'https://hooks.slack.test/x', 'risky'), ($1, 'sms', '+359000', 'info')`,
      [store.agency_id],
    );
    const out: string[] = [];
    const senders = {
      email: async (to: string, subject: string, text: string) => void out.push(`email ${to} | ${subject} | ${text}`),
      slack: async (url: string, text: string) => void out.push(`slack ${url} | ${text}`),
    };
    const items = [
      { agencyId: store.agency_id, storeName: 'Juniper & Ash', reportId: 'r1', periodLabel: 'October 2026', periodStart: '2026-10-01' },
      { agencyId: store.agency_id, storeName: 'Ferro Coffee', reportId: 'r2', periodLabel: 'October 2026', periodStart: '2026-10-01' },
    ];
    assert.equal(await sendReportDigests(pool, items, senders), 2);
    assert.equal(out.length, 2);
    assert.match(out[0] + out[1], /2 October 2026 reports are ready to review/);
    assert.match(out[0], /Ferro Coffee: .*\/reports\/r2\n• Juniper & Ash: .*\/reports\/r1/);
    assert.equal(await sendReportDigests(pool, [], senders), 0);
  });
});

describe('monitoring follows billing (database)', { skip: !db && 'set TEST_DATABASE_URL' }, async () => {
  const { activeStores } = await import('../src/db.ts');
  const d = await freshDb();
  after(() => d!.drop());

  test('stores of agencies without a trial or plan are not monitored', async () => {
    const trial = await seedStore(d!.pool, { name: 'On trial' });
    const lapsed = await seedStore(d!.pool, { name: 'Lapsed', public_url: 'https://lapsed.com' });
    const paying = await seedStore(d!.pool, { name: 'Paying', public_url: 'https://paying.com' });
    await d!.pool.query(`update public.agencies set plan = 'trial', subscription_status = null, trial_ends_at = now() + interval '3 days' where id = $1`, [trial.agency_id]);
    await d!.pool.query(`update public.agencies set plan = 'trial', subscription_status = 'canceled', trial_ends_at = now() - interval '1 day' where id = $1`, [lapsed.agency_id]);
    await d!.pool.query(`update public.agencies set plan = 'solo', subscription_status = 'trialing' where id = $1`, [paying.agency_id]);
    const names = (await activeStores(d!.pool)).map((s) => s.name).sort();
    assert.deepEqual(names, ['On trial', 'Paying']);
  });
});

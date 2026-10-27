import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { FetchResult, ProbeResult } from '@storecare/storefront';
import { runStorefrontDiff } from '../src/jobs/storefront.ts';
import { runUptime } from '../src/jobs/uptime.ts';
import { healthScore, recomputeHealth } from '../src/health.ts';
import { notify } from '../src/notify.ts';
import { parsePsi } from '../src/jobs/speed.ts';
import { freshDb, seedStore } from './helpers.ts';

const probeResult = (over: Partial<ProbeResult> = {}): ProbeResult => ({
  input: 'juniperandash.com',
  baseUrl: 'https://juniperandash.com',
  finalUrl: 'https://juniperandash.com/',
  checkedAt: new Date().toISOString(),
  home: { status: 200, ms: 300, blocked: false },
  isShopify: true,
  theme: { id: 1, name: 'Dawn', schemaName: 'Dawn', schemaVersion: '15.1.0', themeStoreId: 887, role: 'main' },
  apps: [{ key: 'klaviyo', name: 'Klaviyo', known: true, evidence: [] }],
  scriptCount: 5,
  productFeed: {
    status: 'ok',
    pages: 1,
    truncated: false,
    products: [{ id: 1, handle: 'hearthwood-candle', title: 'Hearthwood Candle', updatedAt: null, prices: { '11': '28.00' } }],
  },
  cartJs: { status: 'skipped', reason: 'disallowed by robots.txt' },
  robots: { found: true, homeAllowed: true, productsAllowed: true, cartAllowed: false },
  ...over,
});

const fetchResult = (status: number, blocked = false): FetchResult => ({
  url: 'https://juniperandash.com/', status, ok: status >= 200 && status < 300, headers: {}, body: '', ms: 100, blocked,
});

test('healthScore weights and missing signals', () => {
  const perfect = { checkoutPassRate: 1, uptime: 1, speedScore: 100, unexplainedRiskyChanges: 0, unknownScriptHosts: 0 };
  assert.equal(healthScore(perfect), 100);
  assert.equal(healthScore({ ...perfect, checkoutPassRate: 0 }), 65);
  // No checkout test: scored on the rest, not penalised.
  assert.equal(healthScore({ ...perfect, checkoutPassRate: null }), 100);
  assert.equal(healthScore({ ...perfect, uptime: 0.98 }), 75);
});

test('parsePsi reads score and metrics', () => {
  const s = parsePsi({
    lighthouseResult: {
      categories: { performance: { score: 0.72 } },
      audits: {
        'largest-contentful-paint': { numericValue: 2934.4 },
        'cumulative-layout-shift': { numericValue: 0.04 },
        'total-blocking-time': { numericValue: 180.2 },
      },
    },
  });
  assert.deepEqual(s, { performanceScore: 72, lcpMs: 2934, cls: 0.04, tbtMs: 180 });
});

describe('jobs against Postgres', { skip: !process.env.TEST_DATABASE_URL && 'TEST_DATABASE_URL not set' }, () => {
  let db: Awaited<ReturnType<typeof freshDb>>;
  before(async () => {
    db = await freshDb();
  });
  after(async () => db?.drop());

  test('storefront diff: first snapshot is silent, then theme publish is logged and matched to the work log', async () => {
    const store = await seedStore(db!.pool);
    const first = await runStorefrontDiff(db!.pool, store, async () => probeResult());
    assert.equal(first.firstSnapshot, true);
    assert.equal(first.changes.length, 0);

    await db!.pool.query(
      `insert into public.work_entries (store_id, agency_id, minutes, title) values ($1, $2, 90, 'Published autumn theme')`,
      [store.id, store.agency_id],
    );
    const second = await runStorefrontDiff(db!.pool, store, async () =>
      probeResult({ theme: { id: 2, name: 'Dawn – Autumn', schemaName: 'Dawn', schemaVersion: '15.2.0', themeStoreId: 887, role: 'main' } }),
    );
    assert.deepEqual(second.changes.map((c) => c.kind), ['theme_published']);
    const { rows } = await db!.pool.query(`select kind, summary, work_entry_id from public.changes where store_id = $1`, [store.id]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].summary, 'New live theme: "Dawn – Autumn"');
    assert.ok(rows[0].work_entry_id, 'change should be matched to the work entry');
  });

  test('storefront diff: a blocked visit writes no snapshot and marks the store limited', async () => {
    const store = await seedStore(db!.pool, { public_url: 'https://blocked.example' });
    await runStorefrontDiff(db!.pool, store, async () => probeResult());
    const r = await runStorefrontDiff(db!.pool, store, async () =>
      probeResult({ home: { status: 429, ms: 50, blocked: true }, theme: null, apps: [], productFeed: { status: 'blocked', httpStatus: 429 } }),
    );
    assert.equal(r.changes.length, 0, 'blocked must not look like "all apps removed"');
    const { rows: [s] } = await db!.pool.query(`select status, limited_reason from public.stores where id = $1`, [store.id]);
    assert.deepEqual(s, { status: 'limited', limited_reason: 'blocked' });
    const { rows: [n] } = await db!.pool.query(`select count(*)::int as n from public.storefront_snapshots where store_id = $1`, [store.id]);
    assert.equal(n.n, 1);
  });

  test('uptime: two failures open one incident, recovery resolves it, a bot challenge never does', async () => {
    const store = await seedStore(db!.pool, { public_url: 'https://down.example' });
    assert.equal((await runUptime(db!.pool, store, async () => fetchResult(502))).opened, null);
    const second = await runUptime(db!.pool, store, async () => fetchResult(503));
    assert.ok(second.opened);
    assert.equal((await runUptime(db!.pool, store, async () => fetchResult(503))).opened, null, 'no duplicate incident');
    assert.ok((await runUptime(db!.pool, store, async () => fetchResult(200))).resolved);

    await runUptime(db!.pool, store, async () => fetchResult(429, true));
    const blocked = await runUptime(db!.pool, store, async () => fetchResult(429, true));
    assert.equal(blocked.opened, null);
  });

  test('health is recomputed and stored', async () => {
    const store = await seedStore(db!.pool, { public_url: 'https://health.example' });
    await runUptime(db!.pool, store, async () => fetchResult(200));
    const score = await recomputeHealth(db!.pool, store.id);
    assert.equal(score, 100);
  });

  test('notify sends only to routes at or below the alert severity', async () => {
    const store = await seedStore(db!.pool, { public_url: 'https://notify.example' });
    await db!.pool.query(
      `insert into public.alert_routes (agency_id, channel, target, min_severity) values
         ($1, 'email', 'dev@northline.studio', 'incident'),
         ($1, 'slack', 'https://hooks.slack.test/x', 'risky')`,
      [store.agency_id],
    );
    const sent: string[] = [];
    const senders = {
      email: async (to: string) => void sent.push(`email:${to}`),
      slack: async (url: string) => void sent.push(`slack:${url}`),
    };
    await notify(db!.pool, store, [{ severity: 'risky', title: 'Prices changed on 42 products', body: '' }], senders);
    assert.deepEqual(sent, ['slack:https://hooks.slack.test/x']);
    sent.length = 0;
    await notify(db!.pool, store, [{ severity: 'incident', title: 'Checkout test failed', body: '' }], senders);
    assert.deepEqual(sent.sort(), ['email:dev@northline.studio', 'slack:https://hooks.slack.test/x']);
  });
});

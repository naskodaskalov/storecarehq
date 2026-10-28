import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { FetchResult, ProbeResult } from '@storecare/storefront';
import { runStorefrontDiff } from '../src/jobs/storefront.ts';
import { runUptime } from '../src/jobs/uptime.ts';
import { healthScore, recomputeHealth } from '../src/health.ts';
import { notify } from '../src/notify.ts';
import { parsePsi } from '../src/jobs/speed.ts';
import { expiryAlerts, runSite } from '../src/jobs/site.ts';
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
  assert.deepEqual(s, {
    performanceScore: 72, lcpMs: 2934, cls: 0.04, tbtMs: 180,
    seoScore: null, accessibilityScore: null, bestPracticesScore: null, field: null,
  });
});

test('parsePsi reads real-visitor (CrUX) data and other category scores', () => {
  const s = parsePsi({
    lighthouseResult: { categories: { performance: { score: 0.5 }, seo: { score: 0.92 }, accessibility: { score: 0.81 }, 'best-practices': { score: 1 } } },
    loadingExperience: {},
    originLoadingExperience: {
      overall_category: 'AVERAGE',
      metrics: {
        LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2710, category: 'AVERAGE' },
        INTERACTION_TO_NEXT_PAINT: { percentile: 180, category: 'FAST' },
        CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 4, category: 'FAST' },
      },
    },
  });
  assert.equal(s.seoScore, 92);
  assert.equal(s.accessibilityScore, 81);
  assert.equal(s.bestPracticesScore, 100);
  assert.deepEqual(s.field, { scope: 'origin', lcpMs: 2710, inpMs: 180, cls: 0.04, category: 'AVERAGE' });
});

test('expiry alerts fire on 30/14/7/3/1/0 days only', () => {
  const now = Date.parse('2026-10-28T08:00:00Z');
  const in_ = (d: number) => new Date(now + d * 864e5 + 3600e3).toISOString();
  assert.deepEqual(expiryAlerts({ sslExpiresAt: in_(14), domainExpiresAt: in_(15), domain: 'x.com' }, now).map((a) => a.title), ['SSL certificate expires in 14 days']);
  assert.deepEqual(expiryAlerts({ sslExpiresAt: in_(90), domainExpiresAt: in_(1), domain: 'x.com' }, now).map((a) => a.title), ['Domain x.com expires in 1 day']);
  assert.deepEqual(expiryAlerts({ sslExpiresAt: null, domainExpiresAt: null, domain: 'x.com' }, now), []);
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

  test('storefront diff: blocked visits write no snapshot; only 3 in a row mark the store limited', async () => {
    const store = await seedStore(db!.pool, { public_url: 'https://blocked.example' });
    const blocked = async () =>
      probeResult({ home: { status: 429, ms: 50, blocked: true }, theme: null, apps: [], productFeed: { status: 'skipped', reason: 'home page not readable' } });
    const status = async () =>
      (await db!.pool.query(`select status, limited_reason from public.stores where id = $1`, [store.id])).rows[0];

    await runStorefrontDiff(db!.pool, store, async () => probeResult());
    const r = await runStorefrontDiff(db!.pool, store, blocked);
    assert.equal(r.changes.length, 0, 'blocked must not look like "all apps removed"');
    await runStorefrontDiff(db!.pool, store, blocked);
    assert.deepEqual(await status(), { status: 'active', limited_reason: null });
    await runStorefrontDiff(db!.pool, store, blocked);
    assert.deepEqual(await status(), { status: 'limited', limited_reason: 'blocked' });
    await runStorefrontDiff(db!.pool, store, async () => probeResult());
    assert.deepEqual(await status(), { status: 'active', limited_reason: null });

    const { rows: [n] } = await db!.pool.query(`select count(*)::int as n from public.storefront_snapshots where store_id = $1`, [store.id]);
    assert.equal(n.n, 2);
  });

  test('storefront diff: products are read daily and compared with the last snapshot that has them', async () => {
    const store = await seedStore(db!.pool, { public_url: 'https://daily.example' });
    const asked: boolean[] = [];
    const withProducts = (price: string) => async (_u: string, o: { skipProducts: boolean }) => {
      asked.push(o.skipProducts);
      return o.skipProducts
        ? probeResult({ productFeed: { status: 'skipped', reason: 'not due' } })
        : probeResult({
            productFeed: {
              status: 'ok', pages: 1, truncated: false,
              products: [{ id: 1, handle: 'hearthwood-candle', title: 'Hearthwood Candle', updatedAt: null, prices: { '11': price } }],
            },
          });
    };
    await runStorefrontDiff(db!.pool, store, withProducts('28.00'));
    const hourly = await runStorefrontDiff(db!.pool, store, withProducts('30.00'));
    assert.deepEqual(asked, [false, true], 'second run within a day skips the product feed');
    assert.equal(hourly.changes.length, 0);

    // A day later the feed is read again and compared with the first snapshot's products.
    await db!.pool.query(`update public.storefront_snapshots set taken_at = taken_at - interval '1 day' where store_id = $1`, [store.id]);
    const daily = await runStorefrontDiff(db!.pool, store, withProducts('30.00'));
    assert.equal(asked.at(-1), false);
    assert.deepEqual(daily.changes.map((c) => c.kind), ['prices_changed']);
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

  test('site check stores SSL, domain and broken links', async () => {
    const store = await seedStore(db!.pool, { public_url: 'https://site.example' });
    const home = '<a href="/collections/all">a</a><a href="/pages/gone">b</a>';
    const r = await runSite(db!.pool, store, {
      cert: async () => ({ expiresAt: '2027-01-01T00:00:00.000Z', issuer: "Let's Encrypt" }),
      domain: async () => ({ domain: 'site.example', expiresAt: '2027-06-01T00:00:00.000Z', registrar: 'Namecheap' }),
      get: (async (url: string) => ({
        url, ok: !url.endsWith('gone'), status: url.endsWith('gone') ? 404 : 200, headers: {}, ms: 1, blocked: false,
        body: url.endsWith('robots.txt') ? 'User-agent: *\nDisallow:' : home,
      })) as never,
    });
    assert.equal(r.pagesChecked, 2);
    assert.deepEqual(r.broken, [{ url: 'https://site.example/pages/gone', status: 404 }]);
    const { rows: [row] } = await db!.pool.query(`select ssl_issuer, domain, pages_checked, broken from public.site_checks where store_id = $1`, [store.id]);
    assert.equal(row.ssl_issuer, "Let's Encrypt");
    assert.equal(row.pages_checked, 2);
    assert.equal(row.broken.length, 1);
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

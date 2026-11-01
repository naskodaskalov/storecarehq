import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ScanSummary } from './scan.ts';
import { remember, type Fingerprint, type StoreMemory } from './store-memory.ts';
import { previewRecommendations, previewSummary, reportClock, themeLabel } from './store-preview.ts';

const fp = (over: Partial<Fingerprint> = {}): Fingerprint => ({
  at: '2026-11-01T09:00:00Z',
  home: true,
  ms: 412,
  theme: { id: 1, name: 'Autumn', schema: 'Dawn', version: '15.0.0' },
  apps: [['klaviyo', 'Klaviyo'], ['hotjar', 'Hotjar']],
  feed: { all: true, p: { '1': ['a', 0, 1] }, out: {} },
  ...over,
});

const scan = (over: Partial<ScanSummary> = {}): ScanSummary => ({
  ok: true,
  url: 'https://ferrocoffee.co',
  host: 'ferrocoffee.co',
  responseMs: 412,
  theme: 'Autumn · Dawn 15.0.0',
  apps: ['Klaviyo', 'Hotjar'],
  appCount: 2,
  unknownApps: 0,
  products: { count: 52, more: false },
  soldOut: 0,
  note: null,
  siteName: 'Ferro Coffee',
  fp: fp(),
  ...over,
});

const first = (sc = scan()): StoreMemory => remember(undefined, sc.host, sc.siteName, sc.fp).memory;

test('theme labels read naturally', () => {
  assert.equal(themeLabel({ id: 1, name: 'Autumn', schema: 'Dawn', version: '15.0.0' }), 'Autumn (Dawn 15.0.0)');
  assert.equal(themeLabel({ id: 1, name: 'Dawn', schema: 'Dawn', version: '15.0.0' }), 'Dawn 15.0.0');
  assert.equal(themeLabel({ id: 1, name: null, schema: null, version: null }), 'a custom theme');
  assert.equal(themeLabel(null), null);
});

test('a first look is summarised from what the check saw, nothing more', () => {
  const text = previewSummary(scan(), first(), 'November');
  assert.equal(
    text,
    'On our first check, Ferro Coffee’s home page answered in 0.4s, the live theme is Autumn (Dawn 15.0.0) and 2 apps load on every page. ' +
      'From here we test checkout every morning and note every change, so this report fills in as November goes on.',
  );
  assert.ok(!/uptime|%|incident/i.test(text), 'nothing the check could not have measured');
});

test('a store with no theme or apps visible gets a shorter first sentence', () => {
  const sc = scan({ siteName: null, appCount: 0, apps: [], fp: fp({ theme: null, apps: [] }) });
  assert.match(previewSummary(sc, first(sc), 'November'), /^On our first check, ferrocoffee\.co’s home page answered in 0\.4s\. From here/);
});

test('later looks summarise what changed in between, or that nothing did', () => {
  const quiet = remember(first(), 'ferrocoffee.co', null, fp({ at: '2026-11-04T09:00:00Z' })).memory;
  assert.match(previewSummary(scan(), quiet, 'November'), /We have checked Ferro Coffee 2 times since 1 Nov\. Nothing changed in that time: same theme, same 2 apps and same 52 products\./);
  const busy = remember(first(), 'ferrocoffee.co', null, fp({ at: '2026-11-04T09:00:00Z', theme: { id: 2, name: 'Spring', schema: 'Dawn', version: '15.0.0' }, apps: [['klaviyo', 'Klaviyo']] })).memory;
  assert.match(previewSummary(scan(), busy, 'November'), /we noted 2 changes, the most significant being “New live theme: "Spring"”\./);
});

test('recommendations follow the findings thresholds and lead with unexplained big changes', () => {
  assert.deepEqual(previewRecommendations(scan(), first()), []);
  const busy = remember(first(), 'ferrocoffee.co', null, fp({ at: '2026-11-04T09:00:00Z', theme: { id: 2, name: 'Spring', schema: 'Dawn', version: '15.0.0' } })).memory;
  const recs = previewRecommendations(scan({ responseMs: 2600, appCount: 14, unknownApps: 3, soldOut: 2 }), busy);
  assert.deepEqual(recs.map((r) => r.title), ['Tell us before big changes', 'Speed up the first load', 'Review apps and scripts']);
  assert.match(recs[2].detail, /14 apps and services load on every page, 3 of them/);
  assert.deepEqual(previewRecommendations(scan({ unknownApps: 1 }), first()).map((r) => r.title), ['Confirm unrecognised scripts']);
});

test('the report clock counts what StoreCare would add before the report drafts', () => {
  const c = reportClock(new Date(2026, 10, 1, 22, 51));
  assert.equal(c.month, 'November 2026');
  assert.equal(c.draftsOn, '1 December');
  assert.equal(c.dailyLeft, 29, 'tonight’s 06:00 run is past; 2–30 November remain');
  assert.equal(c.uptimeLeft, Math.floor((29 * 24 * 60 + 69) / 30));
  assert.equal(c.late, false);
  assert.ok(c.progress > 0.03 && c.progress < 0.04);
  const early = reportClock(new Date(2026, 10, 30, 5, 0));
  assert.equal(early.dailyLeft, 1);
  assert.equal(early.late, true);
  assert.equal(early.next.draftsOn, '1 January');
  assert.equal(early.next.daily, 31);
  assert.equal(early.next.uptime, 31 * 48);
});

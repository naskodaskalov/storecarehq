import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ProbeResult } from '@storecare/storefront';
import { handleScan, summarize, type ScanSummary } from './scan.ts';
import { checkupNote, findings } from './scan-findings.ts';

function probe(over: Partial<ProbeResult> = {}): ProbeResult {
  return {
    input: 'shop.example.com',
    baseUrl: 'https://shop.example.com',
    finalUrl: 'https://www.shop.example.com/',
    checkedAt: '2026-11-01T00:00:00Z',
    home: { status: 200, ms: 412, blocked: false },
    isShopify: true,
    theme: { id: 1, name: 'Autumn', schemaName: 'Dawn', schemaVersion: '15.0.0', themeStoreId: 887, role: 'main' },
    apps: [
      { key: 'x', name: 'cdn.unknown.io', known: false, evidence: [] },
      { key: 'klaviyo', name: 'Klaviyo', known: true, evidence: [] },
    ],
    scriptCount: 12,
    productFeed: { status: 'ok', products: [
      { id: 1, handle: 'a', title: 'A', updatedAt: null, prices: {}, soldOut: ['9'] },
      { id: 2, handle: 'b', title: 'B', updatedAt: null, prices: {} },
    ], pages: 1, truncated: true },
    cartJs: { status: 'skipped', reason: 'not requested' },
    robots: { found: true, homeAllowed: true, productsAllowed: true, cartAllowed: true },
    ...over,
  };
}

const allowAll = () => true;
function request(body: unknown, origin = 'https://www.storecarehq.com') {
  return new Request('https://www.storecarehq.com/api/scan', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

test('summary lists the theme, known apps first and product counts, without page contents', () => {
  const s = summarize(probe());
  assert.ok(s.ok);
  assert.equal(s.host, 'shop.example.com');
  assert.equal(s.theme, 'Autumn · Dawn 15.0.0');
  assert.deepEqual(s.apps, ['Klaviyo', 'cdn.unknown.io']);
  assert.deepEqual(s.products, { count: 2, more: true });
  assert.equal(s.soldOut, 1);
  assert.equal(s.note, null);
  assert.ok(!JSON.stringify(s).includes('<'));
});

test('non-Shopify and unreachable stores get a plain error', () => {
  assert.equal(summarize(probe({ isShopify: false })).ok, false);
  assert.equal(summarize(probe({ home: { status: 0, ms: 0, blocked: false, error: 'ENOTFOUND' } })).ok, false);
});

test('limited stores explain what would be limited', () => {
  const s = summarize(probe({ productFeed: { status: 'blocked', httpStatus: 403 } }));
  assert.ok(s.ok && s.note?.includes('product list'));
});

test('scan rejects other origins, internal addresses and over-limit visitors before probing', async () => {
  let probed = 0;
  const config = { probe: async () => { probed++; return probe(); }, allow: allowAll, clientKey: 't' };
  assert.equal((await handleScan(request({ url: 'shop.example.com' }, 'https://evil.example'), config)).status, 403);
  assert.equal((await handleScan(request({ url: '127.0.0.1' }), config)).status, 400);
  assert.equal((await handleScan(request({ url: 'printer.local' }), config)).status, 400);
  assert.equal((await handleScan(request({ url: '' }), config)).status, 400);
  assert.equal((await handleScan(request({ url: 'shop.example.com' }), { ...config, allow: () => false })).status, 429);
  assert.equal(probed, 0);
  const ok = await handleScan(request({ url: 'shop.example.com' }), config);
  assert.equal(ok.status, 200);
  assert.equal(probed, 1);
});

test('a probe that throws becomes a friendly error', async () => {
  const res = await handleScan(request({ url: 'shop.example.com' }), { probe: async () => { throw new Error('boom'); }, allow: allowAll, clientKey: 't' });
  assert.equal(res.status, 502);
  assert.equal((await res.json()).ok, false);
});

function summary(over: Partial<ScanSummary> = {}): ScanSummary {
  const s = summarize(probe());
  assert.ok(s.ok);
  return { ...s, ...over };
}

test('summary counts the scripts we could not name', () => {
  assert.equal(summary().unknownApps, 1);
});

test('findings put things worth a look first and stay phrased as suggestions', () => {
  const list = findings(summary({ responseMs: 2600, appCount: 14, unknownApps: 3, soldOut: 2 }));
  assert.deepEqual(list.map((f) => f.tone), ['look', 'look', 'look', 'look', 'good']);
  assert.match(list[0].text, /2\.6s/);
  assert.match(list[1].text, /14 apps/);
  assert.match(list[2].text, /3 scripts come/);
  assert.match(list[3].text, /2 products have/);
  assert.ok(!list.some((f) => /broken|error|fail/i.test(f.text)));
});

test('a quick, lean store gets only good findings', () => {
  const list = findings(summary({ responseMs: 400, appCount: 3, unknownApps: 0, soldOut: 0 }));
  assert.ok(list.length >= 2 && list.every((f) => f.tone === 'good'));
});

test('the check-up note is signed by the agency and lists what is worth a look', () => {
  const note = checkupNote(summary({ responseMs: 2600 }), 'Northline Studio');
  assert.match(note, /I’m with Northline Studio/);
  assert.match(note, /shop\.example\.com/);
  assert.match(note, /• The home page took 2\.6s/);
  assert.ok(note.trimEnd().endsWith('Northline Studio'));
  assert.ok(!/StoreCare/.test(note), 'the note is in the agency’s name, not ours');
});

test('the check-up note reads fine with nothing to report and no agency name', () => {
  const note = checkupNote(summary({ responseMs: 1200, appCount: 0, unknownApps: 0, soldOut: 0, theme: null }), '  ');
  assert.match(note, /Nothing stood out/);
  assert.ok(!note.includes('I’m with'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ProbeResult } from '@storecare/storefront';
import { buildQuickReport } from './quick-report.ts';

const NOW = Date.parse('2026-11-02T00:00:00Z');

function probe(over: Partial<ProbeResult> = {}): ProbeResult {
  return {
    input: 'shop.example.com',
    baseUrl: 'https://shop.example.com',
    finalUrl: 'https://shop.example.com/',
    checkedAt: '2026-11-02T00:00:00Z',
    home: { status: 200, ms: 2600, blocked: false },
    isShopify: true,
    siteName: 'Example Shop',
    theme: { id: 1, name: 'Dawn', schemaName: 'Dawn', schemaVersion: '15.0.0', themeStoreId: 887, role: 'main' },
    apps: [{ key: 'klaviyo', name: 'Klaviyo', known: true, evidence: [] }],
    scriptCount: 5,
    productFeed: { status: 'ok', products: [{ id: 1, handle: 'a', title: 'A', updatedAt: null, prices: {}, soldOut: ['1'] }], pages: 1, truncated: false },
    cartJs: { status: 200, blocked: false },
    robots: { found: true, homeAllowed: true, productsAllowed: true, cartAllowed: true },
    ...over,
  };
}

test('report groups findings into sections, problems first, and counts them', () => {
  const r = buildQuickReport({
    probe: probe(),
    cert: { expiresAt: '2026-11-10T00:00:00Z', issuer: 'Let’s Encrypt' },
    domain: { domain: 'example.com', expiresAt: '2027-06-01T00:00:00Z', registrar: 'Namecheap' },
    links: { checked: 10, broken: [{ url: 'https://shop.example.com/pages/old', status: 404 }] },
    speed: { performance: 31, seo: 92, accessibility: 80, lcpMs: 5200 },
    now: NOW,
  }, 'Acme Agency');
  assert.ok(r.ok);
  assert.equal(r.siteName, 'Example Shop');
  assert.deepEqual(r.sections.map((s) => s.title), ['Speed', 'SSL and domain', 'Links', 'Theme, apps and products']);
  const speed = r.sections[0].items;
  assert.equal(speed[0].tone, 'look');
  assert.match(speed.map((f) => f.text).join(' '), /PageSpeed score 31\/100/);
  assert.match(r.sections[1].items[0].text, /SSL certificate expires in 8 days/);
  assert.match(r.sections[2].items.map((f) => f.text).join(' '), /\/pages\/old answers 404/);
  assert.ok(r.looks >= 5);
  assert.match(r.note, /Acme Agency/);
  assert.doesNotMatch(r.note, /answers 404/);
});

test('missing checks are left out instead of reported as problems', () => {
  const r = buildQuickReport({ probe: probe({ home: { status: 200, ms: 300, blocked: false } }), cert: null, domain: null, links: null, speed: null, now: NOW });
  assert.ok(r.ok);
  assert.deepEqual(r.sections.map((s) => s.title), ['Speed', 'Theme, apps and products']);
});

test('a store that is not on Shopify returns the scan error', () => {
  const r = buildQuickReport({ probe: probe({ isShopify: false }), cert: null, domain: null, links: null, speed: null, now: NOW });
  assert.equal(r.ok, false);
});

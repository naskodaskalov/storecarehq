// "Check all your client stores" on a hosted outreach link: which cookies go to sign-up, and when.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ProbeResult } from '@storecare/storefront';
import { buildQuickReport } from './quick-report.ts';
import { newPack, validateProspect } from './outreach.ts';
import { memoryReportStore, publishReportLinks, revokeReportLinks } from './outreach-report-links.ts';
import { startSignup } from './outreach-start.ts';
import { readOffer } from './signup-offer.ts';

const NOW = Date.parse('2026-11-05T10:00:00Z');
const probe: ProbeResult = {
  input: 'store.example.com', baseUrl: 'https://store.example.com', finalUrl: 'https://store.example.com/', checkedAt: '2026-11-05T10:00:00Z',
  home: { status: 200, ms: 640, blocked: false }, isShopify: true, siteName: 'Example Shop',
  theme: { id: 1, name: 'Dawn', schemaName: 'Dawn', schemaVersion: '15.0.0', themeStoreId: 887, role: 'main' },
  apps: [], scriptCount: 5, productFeed: { status: 'ok', products: [], pages: 1, truncated: false }, cartJs: { status: 200, blocked: false },
  robots: { found: true, homeAllowed: true, productsAllowed: true, cartAllowed: true },
  page: { pageType: 'index', password: false, unavailable: false, noindex: null, googleBlocked: false, products: [] }, featured: [],
};

async function published() {
  const report = buildQuickReport({ probe, cert: null, domain: null, links: null, speed: null, now: NOW }, 'StoreCare HQ');
  const prospect = validateProspect({ agency_name: 'North Studio', agency_url: 'north.example.com', client_store_url: 'store.example.com', portfolio_source_url: 'north.example.com/work', contact_name: 'Ana Ruiz', contact_email: 'ana@north.example.com' });
  const pack = { ...newPack(prospect), reviewed: true, draft: 'Hi Ana', preparedAt: '2026-11-05T10:00:00Z', status: 'prepared' as const, report };
  const store = memoryReportStore();
  const links = await publishReportLinks({ pack, subject: 'Black Friday check on store.example.com' }, 'admin@example.com', store, 'https://app.storecarehq.com', NOW);
  return { store, links };
}

test('before Black Friday: the client store for both hosts, and a signed offer for the trial until 2 December', async () => {
  const { store, links } = await published();
  const r = await startSignup(links.healthToken, store, { host: 'app.storecarehq.com', secure: true, now: NOW, key: 'k' });
  assert.equal(r.location, '/login?trial=1');
  const [site, offer] = r.cookies;
  assert.deepEqual({ ...site, expires: undefined }, { name: 'sc_store', value: 'store.example.com', httpOnly: false, secure: true, sameSite: 'lax', path: '/', domain: '.storecarehq.com', expires: undefined });
  assert.equal(offer.name, 'sc_offer');
  assert.ok(offer.httpOnly && offer.secure);
  assert.equal(offer.expires.toISOString(), '2026-11-27T00:00:00.000Z');
  const read = readOffer(offer.value, 'k', NOW);
  assert.equal(read?.snapshotId, links.id);
  assert.equal(new Date(read!.trialEnd).toISOString(), '2026-12-02T12:00:00.000Z');
  const sample = await startSignup(links.sampleToken, store, { host: 'localhost:3100', secure: false, now: NOW, key: 'k' });
  assert.equal(sample.cookies[0].value, 'store.example.com', 'the sample report link prefills the same store');
  assert.equal(sample.cookies[0].domain, undefined);
});

test('from Black Friday, or without a signing key, only the store is prefilled', async () => {
  const { store, links } = await published();
  const later = await startSignup(links.healthToken, store, { host: 'app.storecarehq.com', secure: true, now: Date.parse('2026-11-27T09:00:00Z'), key: 'k' });
  assert.deepEqual(later.cookies.map((c) => c.name), ['sc_store']);
  const unsigned = await startSignup(links.healthToken, store, { host: 'app.storecarehq.com', secure: true, now: NOW, key: null });
  assert.deepEqual(unsigned.cookies.map((c) => c.name), ['sc_store']);
});

test('an unknown, malformed or revoked link opens sign-up without cookies', async () => {
  const { store, links } = await published();
  for (const token of ['f'.repeat(64), 'nope']) {
    assert.deepEqual(await startSignup(token, store, { host: 'app.storecarehq.com', secure: true, now: NOW, key: 'k' }), { location: '/login?trial=1', cookies: [] });
  }
  await revokeReportLinks(links.id, 'admin@example.com', store, NOW);
  assert.deepEqual((await startSignup(links.healthToken, store, { host: 'app.storecarehq.com', secure: true, now: NOW, key: 'k' })).cookies, []);
});

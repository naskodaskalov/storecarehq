import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PageState } from '@storecare/storefront';
import { buildBfcmAudit, countdown, headline, inSeason, leadFinding, saleDates, validAudit, type AuditInput, type LiveCheck } from './bfcm.ts';

const NOW = Date.parse('2026-11-05T12:00:00Z');
const DAY = 864e5;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const ahead = (days: number) => new Date(NOW + days * DAY).toISOString();

const page: PageState = { pageType: 'index', password: false, unavailable: false, noindex: null, googleBlocked: false, products: ['hearthwood-candle', 'fig-diffuser'] };
const live = (over: Partial<LiveCheck> = {}): LiveCheck => ({
  status: 200, ms: 640, blocked: false, page: { ...page, products: [...page.products] },
  apps: [{ name: 'Klaviyo', known: true }, { name: 'Judge.me', known: true }],
  featured: [{ handle: 'hearthwood-candle', state: 'available', title: 'Hearthwood Candle', status: 200 }, { handle: 'fig-diffuser', state: 'available', title: 'Fig Diffuser', status: 200 }],
  ...over,
});
const input = (over: Partial<AuditInput> = {}): AuditInput => ({
  kind: 'store', storeName: 'Juniper & Ash', url: 'https://www.juniperandash.com', now: NOW, live: live(),
  checkout: { consent: true, runs: [{ ran_at: ago(0.3), result: 'pass', device: 'mobile', failed_step: null }, { ran_at: ago(0.3), result: 'pass', device: 'desktop', failed_step: null }] },
  incidents: [], uptime: { checks: 1440, ok: 1440 }, changes: [],
  speed: { at: ago(0.5), performance: 78, lcpMs: 2100, field: 'FAST', fieldLcpMs: 2000 },
  ssl: { at: ago(0.4), expiresAt: ahead(64), error: null },
  domain: { at: ago(0.4), name: 'juniperandash.com', expiresAt: ahead(300), error: null },
  links: { at: ago(0.4), checked: 22, broken: [] },
  ...over,
});
const tone = (a: ReturnType<typeof buildBfcmAudit>, key: string) => a.items.find((i) => i.key === key)?.tone;
const text = (a: ReturnType<typeof buildBfcmAudit>, key: string) => a.items.find((i) => i.key === key)?.text ?? '';

test('sale dates: Black Friday is the day after the fourth Thursday of November; rolls over after Cyber Monday', () => {
  assert.deepEqual(saleDates(NOW), { blackFriday: '2026-11-27', cyberMonday: '2026-11-30', daysToBlackFriday: 22, phase: 'before' });
  assert.equal(countdown(NOW), '22 days to Black Friday');
  assert.equal(countdown(Date.parse('2026-11-26T08:00:00Z')), 'Black Friday is tomorrow');
  assert.equal(countdown(Date.parse('2026-11-27T23:00:00Z')), 'Black Friday is today');
  assert.equal(countdown(Date.parse('2026-11-29T10:00:00Z')), 'Black Friday weekend');
  assert.equal(countdown(Date.parse('2026-11-30T10:00:00Z')), 'Cyber Monday is today');
  assert.equal(saleDates(Date.parse('2026-12-01T00:00:00Z')).blackFriday, '2027-11-26');
  assert.equal(saleDates(Date.parse('2025-11-01T00:00:00Z')).blackFriday, '2025-11-28');
  assert.ok(inSeason(Date.parse('2026-10-01T00:00:00Z')) && inSeason(Date.parse('2026-11-30T20:00:00Z')));
  assert.ok(!inSeason(Date.parse('2026-09-01T00:00:00Z')) && !inSeason(Date.parse('2026-12-02T00:00:00Z')));
});

test('a healthy store is ready, with every check in a fixed order', () => {
  const a = buildBfcmAudit(input());
  assert.deepEqual(a.items.map((i) => i.key), ['open', 'search', 'checkout', 'uptime', 'speed', 'products', 'links', 'ssl', 'domain', 'apps', 'changes']);
  assert.deepEqual(a.items.filter((i) => i.tone !== 'good').map((i) => i.key), []);
  assert.deepEqual([a.verdict, a.fixes, a.looks, a.host, a.url], ['ready', 0, 0, 'juniperandash.com', 'https://www.juniperandash.com']);
  assert.equal(headline(a), 'Ready for Black Friday');
  assert.match(text(a, 'products'), /In stock: 2 products .*Hearthwood Candle, Fig Diffuser/);
  assert.match(text(a, 'checkout'), /passed on 5 Nov 2026 \(desktop and mobile\)/);
  assert.equal(leadFinding(a), null);
  assert.ok(validAudit(a));
});

test('password page: a fix, and the checks behind it are "not checked", not failures', () => {
  const a = buildBfcmAudit(input({ live: live({ page: { ...page, pageType: 'password', password: true, products: [] }, apps: [], featured: [] }) }));
  assert.equal(tone(a, 'open'), 'fix');
  for (const key of ['search', 'products', 'apps']) {
    assert.equal(tone(a, key), 'unknown', key);
    assert.equal(text(a, key), 'Not checked while the password page is on.');
  }
  assert.equal(a.verdict, 'fix');
  assert.equal(leadFinding(a), 'the password page is still on, so shoppers can’t get in');
  assert.equal(headline(a), '1 thing to fix before Black Friday');
});

test('the things that cost sales are fixes: noindex, sold-out or missing promoted products, failed checkout, renewals in the sale window', () => {
  const a = buildBfcmAudit(input({
    live: live({
      page: { ...page, noindex: 'meta' },
      featured: [{ handle: 'hearthwood-candle', state: 'sold_out', title: 'Hearthwood Candle', status: 200 }, { handle: 'old-hero', state: 'missing', title: null, status: 404 }],
    }),
    checkout: { consent: true, runs: [
      { ran_at: ago(0.2), result: 'fail', device: 'mobile', failed_step: 'add_to_cart' },
      { ran_at: ago(0.2), result: 'pass', device: 'desktop', failed_step: null },
      { ran_at: ago(1.2), result: 'pass', device: 'mobile', failed_step: null },
    ] },
    ssl: { at: ago(0.4), expiresAt: ago(1), error: null },
    domain: { at: ago(0.4), name: 'juniperandash.com', expiresAt: ahead(19), error: null },
  }));
  assert.deepEqual(a.items.filter((i) => i.tone === 'fix').map((i) => i.key), ['search', 'checkout', 'products', 'ssl', 'domain']);
  assert.match(text(a, 'checkout'), /failed at add to cart \(mobile/);
  assert.match(text(a, 'products'), /Sold out but promoted on the home page: Hearthwood Candle\. A product the home page links to no longer exists \(\/products\/old-hero\)\. Restock or swap them/);
  assert.match(text(a, 'domain'), /expires on 24 Nov 2026, right around the sale/);
  assert.match(text(a, 'ssl'), /expired on 4 Nov 2026/);
  assert.equal(leadFinding(a), 'the home page tells Google not to list it');
  assert.equal(a.fixes, 5);
});

test('robots.txt blocking Google is a fix; a store closed by Shopify is a fix', () => {
  assert.equal(tone(buildBfcmAudit(input({ live: live({ page: { ...page, googleBlocked: true } }) })), 'search'), 'fix');
  const closed = buildBfcmAudit(input({ live: live({ status: 404, page: { ...page, pageType: null, unavailable: true, products: [] }, featured: [] }) }));
  assert.equal(tone(closed, 'open'), 'fix');
  assert.match(text(closed, 'open'), /Store unavailable/);
});

test('worth a look, not a fix: slow mobile, broken links, outages, heavy apps, recent theme and app changes', () => {
  const a = buildBfcmAudit(input({
    live: live({ apps: Array.from({ length: 13 }, (_, i) => ({ name: `App ${i}`, known: i > 2 })) }),
    speed: { at: ago(0.5), performance: 41, lcpMs: 4600, field: 'SLOW', fieldLcpMs: 3600 },
    links: { at: ago(0.4), checked: 22, broken: [{ url: 'https://juniperandash.com/pages/summer-sale', status: 404 }] },
    uptime: { checks: 1440, ok: 1430 },
    changes: [{ kind: 'theme_published', occurred_at: ago(6), summary: 'New live theme: "Dawn – Autumn"' }, { kind: 'app_added', occurred_at: ago(3), summary: 'Smile.io added' }, { kind: 'app_added', occurred_at: ago(30), summary: 'Old added' }],
  }));
  assert.deepEqual(a.items.filter((i) => i.tone === 'look').map((i) => i.key), ['uptime', 'speed', 'links', 'apps', 'changes']);
  assert.equal(a.verdict, 'look');
  assert.match(text(a, 'speed'), /main content shows after 4\.6s, score 41\/100; real Chrome visitors rate it poor \(3\.6s\)/);
  assert.match(text(a, 'links'), /\/pages\/summer-sale \(404\)/);
  assert.match(text(a, 'changes'), /A new theme went live on 30 Oct 2026\. 1 app added in the last 14 days \(Smile\.io\)\. Test checkout with them live/);
  assert.match(text(a, 'uptime'), /Up 99\.31%/);
  assert.equal(headline(a), 'Ready for Black Friday, with 5 things worth a look');
  assert.equal(leadFinding(a), 'it was up 99.31% of the last 30 days', 'specific findings open emails');
  const appsOnly = buildBfcmAudit(input({ live: live({ apps: Array.from({ length: 13 }, (_, i) => ({ name: `App ${i}`, known: true })) }) }));
  assert.equal(appsOnly.verdict, 'look');
  assert.equal(leadFinding(appsOnly), null, 'app weight alone never opens an email');
});

test('missing, stale or switched-off data is "not checked", never a problem', () => {
  const a = buildBfcmAudit(input({
    checkout: { consent: false, runs: [] },
    uptime: { checks: 0, ok: 0 },
    speed: { at: ago(5), performance: 20, lcpMs: 9000 },
    links: { at: ago(8), checked: 22, broken: [{ url: 'https://x.com/a', status: 404 }] },
    ssl: null,
    domain: { at: ago(0.4), name: 'juniperandash.io', expiresAt: null, error: 'no RDAP service for this domain ending' },
  }));
  assert.deepEqual(a.items.filter((i) => i.tone === 'unknown').map((i) => i.key), ['checkout', 'uptime', 'speed', 'links', 'ssl', 'domain']);
  assert.equal(a.verdict, 'ready');
  assert.match(text(a, 'checkout'), /isn’t switched on/);
});

test('a blocked visit or one that never ran is "not checked"; an open down incident is a fix', () => {
  const blocked = buildBfcmAudit(input({ live: live({ blocked: true, status: 429 }) }));
  assert.deepEqual(['open', 'search', 'products', 'apps'].map((k) => tone(blocked, k)), ['unknown', 'unknown', 'unknown', 'unknown']);
  assert.match(text(blocked, 'open'), /firewall/);
  assert.equal(blocked.verdict, 'partial', 'a store we couldn’t load is never called ready');
  assert.equal(headline(blocked), 'Not fully checked: we couldn’t load the storefront');
  assert.ok(validAudit(blocked));
  const blockedButFixable = buildBfcmAudit(input({ live: live({ blocked: true, status: 429 }), domain: { at: ago(0.4), name: 'juniperandash.com', expiresAt: ahead(10), error: null } }));
  assert.equal(blockedButFixable.verdict, 'fix', 'a fix found elsewhere still leads');
  const none = buildBfcmAudit(input({ live: null, incidents: [{ kind: 'down', opened_at: ago(0.1), cause: 'home page timed out' }] }));
  assert.equal(tone(none, 'open'), 'unknown');
  assert.equal(tone(none, 'uptime'), 'fix');
  assert.match(text(none, 'uptime'), /open since 5 Nov 2026: home page timed out/);
});

test('an older checkout failure that has since passed on the same device is fine; no recent run is not checked', () => {
  const runs = [{ ran_at: ago(1.5), result: 'fail', device: 'mobile', failed_step: 'checkout' }, { ran_at: ago(0.5), result: 'pass', device: 'mobile', failed_step: null }];
  assert.equal(tone(buildBfcmAudit(input({ checkout: { consent: true, runs } })), 'checkout'), 'good');
  assert.equal(tone(buildBfcmAudit(input({ checkout: { consent: true, runs: [{ ran_at: ago(4), result: 'fail', device: 'mobile', failed_step: null }] } })), 'checkout'), 'unknown');
});

test('a prospect’s one-pager has no monitoring sections and never claims a checkout result', () => {
  const a = buildBfcmAudit(input({ kind: 'prospect', checkout: undefined, uptime: undefined, incidents: undefined, changes: undefined }));
  assert.deepEqual(a.items.map((i) => i.key), ['open', 'search', 'checkout', 'speed', 'products', 'links', 'ssl', 'domain', 'apps']);
  assert.equal(tone(a, 'checkout'), 'unknown');
  assert.match(text(a, 'checkout'), /needs the store owner’s OK/);
});

test('validAudit rejects tampered or oversized audits', () => {
  const a = buildBfcmAudit(input());
  assert.ok(validAudit(JSON.parse(JSON.stringify(a))));
  assert.ok(!validAudit({ ...a, items: [{ ...a.items[0], tone: 'great' }] }));
  assert.ok(!validAudit({ ...a, items: [{ ...a.items[0], text: 'x'.repeat(601) }] }));
  assert.ok(!validAudit({ ...a, url: 'javascript:alert(1)' }));
  assert.ok(!validAudit({ ...a, version: 2 }));
  assert.ok(!validAudit(null));
});

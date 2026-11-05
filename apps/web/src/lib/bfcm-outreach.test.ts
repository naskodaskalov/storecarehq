// The Black Friday one-pager as the outreach hook, the client email, and the quick report and scan changes behind it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ProbeResult } from '@storecare/storefront';
import { buildQuickReport, type QuickReport } from './quick-report.ts';
import { bfcmOutreach, draftMessage, newPack, restorePacks, serializePacks, validateProspect } from './outreach.ts';
import { defaultOutreachSubject, outreachEmail } from './outreach-email.ts';
import { buildSnapshot, memoryReportStore, publishReportLinks, readPublicReport } from './outreach-report-links.ts';
import { auditEmailHtml, auditEmailKey, auditEmailSubject, auditEmailText } from './bfcm-email.ts';
import { summarize } from './scan.ts';

const NOW = Date.parse('2026-11-05T10:00:00Z');
const page = { pageType: 'index', password: false, unavailable: false, noindex: null, googleBlocked: false, products: ['hearthwood-candle'] };
const probe = (over: Partial<ProbeResult> = {}): ProbeResult => ({
  input: 'shop.example.com', baseUrl: 'https://shop.example.com', finalUrl: 'https://shop.example.com/', checkedAt: '2026-11-05T10:00:00Z',
  home: { status: 200, ms: 640, blocked: false }, isShopify: true, siteName: 'Example Shop',
  theme: { id: 1, name: 'Dawn', schemaName: 'Dawn', schemaVersion: '15.0.0', themeStoreId: 887, role: 'main' },
  apps: [{ key: 'klaviyo', name: 'Klaviyo', known: true, evidence: [] }], scriptCount: 5,
  productFeed: { status: 'ok', products: [], pages: 1, truncated: false }, cartJs: { status: 200, blocked: false },
  robots: { found: true, homeAllowed: true, productsAllowed: true, cartAllowed: true },
  page, featured: [{ handle: 'hearthwood-candle', state: 'sold_out', title: 'Hearthwood Candle', status: 200 }],
  ...over,
});
const report = (over: Partial<ProbeResult> = {}) => buildQuickReport({
  probe: probe(over), cert: { expiresAt: '2027-01-20T00:00:00Z', issuer: 'Let’s Encrypt' }, domain: { domain: 'example.com', expiresAt: '2027-06-01T00:00:00Z', registrar: 'Namecheap' },
  links: { checked: 12, broken: [] }, speed: { performance: 64, seo: 92, accessibility: 88, lcpMs: 3100 }, now: NOW,
}, 'Acme Agency');
const prospect = () => validateProspect({ agency_name: 'North Studio', agency_url: 'north.example.com', client_store_url: 'store.example.com', portfolio_source_url: 'north.example.com/work', contact_name: 'Ana Ruiz', contact_email: 'ana@north.example.com' });

test('the quick report carries a prospect one-pager: live checks only, no checkout claim', () => {
  const r = report();
  assert.ok(r.ok && r.bfcm);
  assert.equal(r.bfcm.kind, 'prospect');
  assert.equal(r.bfcm.storeName, 'Example Shop');
  assert.deepEqual(r.bfcm.items.filter((i) => i.tone === 'fix').map((i) => i.key), ['products']);
  assert.equal(r.bfcm.items.find((i) => i.key === 'checkout')?.tone, 'unknown');
  assert.ok(!r.bfcm.items.some((i) => i.key === 'uptime' || i.key === 'changes'));
});

test('a password-protected prospect: the one-pager says so; the scan no longer calls it headless', () => {
  const locked = probe({ finalUrl: 'https://shop.example.com/password', theme: null, apps: [], featured: undefined, page: { ...page, pageType: 'password', password: true, products: [] } });
  const s = summarize(locked);
  assert.ok(s.ok);
  assert.match(s.ok ? s.note ?? '' : '', /password page is on/);
  const r = report({ finalUrl: 'https://shop.example.com/password', theme: null, apps: [], featured: undefined, page: { ...page, pageType: 'password', password: true, products: [] } });
  assert.ok(r.ok && r.bfcm && r.bfcm.items[0].tone === 'fix');
  const closed = summarize(probe({ home: { status: 404, ms: 40, blocked: false }, page: { ...page, pageType: null, unavailable: true, products: [] } }));
  assert.ok(!closed.ok && /Store unavailable/.test(closed.error));
});

test('before Black Friday the outreach draft and subject lead with the readiness check; afterwards they don’t', () => {
  const r = report();
  assert.ok(bfcmOutreach(r, NOW));
  const draft = draftMessage(prospect(), r, 'Nasko', NOW);
  assert.match(draft, /^Hi Ana,/);
  assert.match(draft, /with Black Friday 22 days out, ran a quick readiness check on it from the outside\. One thing stood out: the home page promotes “Hearthwood Candle”, which is sold out\./);
  assert.equal(defaultOutreachSubject('North Studio', 'https://www.store.example.com', true), 'Black Friday check on store.example.com');
  assert.equal(defaultOutreachSubject('North Studio', 'https://store.example.com'), 'Quick health check on store.example.com');
  const after = Date.parse('2026-11-27T10:00:00Z');
  assert.ok(!bfcmOutreach(r, after), 'not on the day itself');
  assert.doesNotMatch(draftMessage(prospect(), r, 'Nasko', after), /Black Friday/);
  const old = { ...r, bfcm: undefined } as QuickReport;
  assert.ok(!bfcmOutreach(old, NOW), 'a report saved before the one-pager existed keeps the old email');
});

test('a store that looks ready gets no invented finding; one that blocked us gets the plain health check', () => {
  const r = report({ featured: [{ handle: 'hearthwood-candle', state: 'available', title: 'Hearthwood Candle', status: 200 }] });
  assert.match(draftMessage(prospect(), r, 'Nasko', NOW), /It looks ready from the outside\./);
  const blocked = report({ home: { status: 429, ms: 90, blocked: true }, featured: undefined, page: undefined });
  assert.ok(blocked.ok && !blocked.bfcm, 'no “not fully checked” one-pager for a prospect');
  assert.ok(!bfcmOutreach(blocked, NOW));
  assert.doesNotMatch(draftMessage(prospect(), blocked, 'Nasko', NOW), /Black Friday|looks ready/);
});

test('backups keep the one-pager, reject a tampered one, and old backups still load', () => {
  const pack = { ...newPack(prospect()), reviewed: true, draft: 'Hi', preparedAt: '2026-11-05T10:00:00Z', status: 'prepared' as const, report: report() };
  assert.deepEqual(restorePacks(serializePacks([pack])), [pack]);
  const r = report();
  if (!r.ok || !r.bfcm) throw new Error('expected a one-pager');
  const forged = { ...pack, report: { ...r, bfcm: { ...r.bfcm, items: [{ key: 'open', tone: 'great', text: 'x' }] } } };
  assert.throws(() => restorePacks(serializePacks([forged as typeof pack])), /Invalid Black Friday check/);
  const legacy = { ...pack, report: { ...r, bfcm: undefined } };
  assert.equal(restorePacks(serializePacks([legacy])).length, 1);
});

test('hosted links carry the one-pager and the agency it was prepared for; the email names the Black Friday check', async () => {
  const pack = { ...newPack(prospect()), reviewed: true, draft: 'Hi Ana', preparedAt: '2026-11-05T10:00:00Z', status: 'prepared' as const, report: report() };
  const input = { pack, subject: 'Black Friday check on store.example.com' };
  const snapshot = buildSnapshot(input);
  assert.equal(snapshot.health.preparedFor, 'North Studio');
  assert.equal(snapshot.health.bfcm?.kind, 'prospect');
  assert.match(snapshot.documents[0].html, /Black Friday readiness: 1 thing to fix before Black Friday/);
  const store = memoryReportStore();
  const links = await publishReportLinks(input, 'admin@example.com', store, 'https://app.storecarehq.com', NOW);
  const view = await readPublicReport(links.healthToken, store, NOW);
  assert.ok(view?.kind === 'health' && view.health.bfcm?.storeName === 'Example Shop');
  const email = outreachEmail({ ...input, pack: { ...pack, links } });
  assert.match(email.text, /Black Friday check: https:\/\/app\.storecarehq\.com\/outreach\/r\//);
  const legacy = buildSnapshot({ pack: { ...pack, report: { ...(pack.report as Extract<QuickReport, { ok: true }>), bfcm: undefined } }, subject: 'x' });
  assert.deepEqual(Object.keys(legacy.health), ['host', 'checkedAt', 'sections'], 'older reports snapshot exactly as before');
});

test('client email: agency-branded, fixes first, escaped, one email per audit, note and address', () => {
  const r = report();
  if (!r.ok || !r.bfcm) throw new Error('expected a one-pager');
  const audit = { ...r.bfcm, kind: 'store' as const, storeName: 'Juniper <& Ash>' };
  const e = { agencyName: 'Northline', brandColor: '#2747A8', audit, note: 'We freeze changes from 24 Nov.', link: 'https://app.storecarehq.com/r/audit/abc', contactName: 'Maya Ortiz' };
  assert.equal(auditEmailSubject(audit), 'Juniper <& Ash>: Black Friday readiness check');
  const text = auditEmailText(e);
  assert.match(text, /^Hi Maya,\n\nWe checked Juniper <& Ash> ahead of Black Friday \(Fri 27 Nov\)\. There is 1 thing to fix before the sale\./);
  assert.match(text, /• Products on the home page: Sold out but promoted/);
  assert.match(text, /We freeze changes from 24 Nov\.\n\nThe one-page check: https:\/\/app\.storecarehq\.com\/r\/audit\/abc\n\nNorthline$/);
  const html = auditEmailHtml(e);
  assert.ok(html.includes('Juniper &lt;&amp; Ash&gt;') && !html.includes('<& Ash>'));
  assert.ok(html.includes('href="https://app.storecarehq.com/r/audit/abc"') && html.includes('View the one-page check'));
  assert.notEqual(auditEmailKey('a1', 'x', 'c@d.com'), auditEmailKey('a1', 'y', 'c@d.com'), 'an edited note is a new email');
  assert.equal(auditEmailKey('a1', 'x', 'C@D.com '), auditEmailKey('a1', 'x', 'c@d.com'));
});

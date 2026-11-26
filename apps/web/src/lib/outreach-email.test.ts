import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outreachEmail, validateTestEmail } from './outreach-email.ts';
import { newPack, noStoreDraftMessage, TEXT_ONLY_SUBJECT, validateProspect } from './outreach.ts';
import type { QuickReport } from './quick-report.ts';

function input() {
  const pack = newPack(validateProspect({ agency_name: 'North <Studio>', agency_url: 'north.example.com', contact_email: 'agency@north.example.com', client_store_url: 'store.example.com', portfolio_source_url: 'north.example.com/work' }));
  pack.reviewed = true; pack.preparedAt = '2026-11-02T10:00:00Z'; pack.draft = 'Hi team,\n\nHere is a sample <script>alert(1)</script>.';
  pack.report = { ok: true, host: 'store.example.com', url: 'https://store.example.com', checkedAt: pack.preparedAt, sections: [{ title: 'Speed', items: [{ tone: 'good', text: 'Mobile PageSpeed score 74/100.' }] }] } as QuickReport;
  pack.links = { id: '11111111-1111-4111-8111-111111111111', healthToken: 'a'.repeat(64), sampleToken: 'b'.repeat(64), sourceDigest: 'c'.repeat(64), origin: 'https://app.storecarehq.com', expiresAt: '2026-12-02T10:00:00Z' };
  return { pack, subject: 'A sample report' };
}

test('branded email has two report buttons, one short note, no headline and separate downloadable documents', () => {
  const email = outreachEmail(input());
  assert.equal(email.subject, 'A sample report');
  assert.match(email.html, /max-width:560px/);
  assert.doesNotMatch(email.html, /<h1|Make your Shopify care work visible/);
  assert.match(email.html, /bgcolor="#1d3034"/);
  assert.match(email.html, /background:#2747a8/);
  assert.match(email.html, /\[if mso\]/);
  assert.match(email.html, /Prepared for North &lt;Studio&gt;/);
  assert.match(email.html, /View the health check/);
  assert.match(email.html, /Sample monthly report/);
  assert.equal((email.html.match(/example data/g) ?? []).length, 1);
  assert.doesNotMatch(email.html, />https:\/\/app\.storecarehq\.com\/outreach/);
  assert.ok(email.text.includes(`/outreach/r/${'a'.repeat(64)}`));
  assert.ok(email.text.includes(`/outreach/r/${'b'.repeat(64)}`));
  assert.doesNotMatch(email.html, /reports are attached/);
  assert.match(email.text, /The sample report uses example data/);
  assert.match(email.text, /Reply "no"/);
  assert.equal(email.documents.length, 2);
  assert.match(email.documents[0].html, /2026-11-02T10:00:00Z/);
  assert.doesNotMatch(email.documents[0].html, /Uptime: 100%|fictional store/);
  assert.match(email.documents[1].html, /October 2026/);
  assert.match(email.documents[1].html, /ILLUSTRATIVE SAMPLE/);
  assert.match(email.documents[1].html, /5h of 10h/);
});
test('all user content is escaped in email and report documents', () => {
  const value = input();
  if (value.pack.report?.ok) value.pack.report.sections[0].items[0].text = '<img src=x onerror=alert(1)>';
  const email = outreachEmail(value);
  for (const html of [email.html, ...email.documents.map(d => d.html)]) {
    assert.doesNotMatch(html, /<script>|<img src=x|North <Studio>/);
    assert.match(html, /North &lt;Studio&gt;/);
  }
  assert.match(email.html, /&lt;script&gt;/);
});
test('unreviewed, failed, empty or oversized drafts and injected subject headers cannot be approved', () => {
  const value = input();
  assert.throws(() => validateTestEmail({ ...value, subject: 'Subject\r\nBcc: victim@example.com' }), /subject/);
  assert.throws(() => validateTestEmail({ ...value, pack: { ...value.pack, reviewed: false } }), /Review/);
  assert.throws(() => validateTestEmail({ ...value, pack: { ...value.pack, report: { ok: false, error: 'blocked' } } }), /successful/);
  assert.throws(() => validateTestEmail({ ...value, pack: { ...value.pack, draft: ' ' } }), /introduction/);
  assert.throws(() => validateTestEmail({ ...value, pack: { ...value.pack, draft: 'x'.repeat(20001) } }));
});

test('default subject names the client store the check was run on', async () => {
  const { defaultOutreachSubject } = await import('./outreach-email.ts');
  assert.equal(defaultOutreachSubject('North', 'https://www.lullenspa.com'), 'Quick health check on lullenspa.com');
  assert.equal(defaultOutreachSubject('North'), 'A quick health check on one of your client stores');
});

test('the signature links storecarehq.com, and only our own site', async () => {
  const { linkOwnSite } = await import('./outreach-email.ts');
  assert.equal(linkOwnSite('StoreCare HQ · storecarehq.com'), 'StoreCare HQ · <a href="https://www.storecarehq.com" style="color:#2747a8;text-decoration:underline">storecarehq.com</a>');
  assert.match(linkOwnSite('see https://www.storecarehq.com today'), /<a href="https:\/\/www.storecarehq.com"[^>]*>https:\/\/www.storecarehq.com<\/a> today/);
  for (const untouched of ['support@storecarehq.com', 'app.storecarehq.com/r/x', 'lullenspa.com', 'mystorecarehq.com', 'storecarehq.company'])
    assert.equal(linkOwnSite(untouched), untouched, untouched);
  const value = input(); value.pack.draft = 'Hi,\n\nNasko\nStoreCare HQ · storecarehq.com';
  assert.match(outreachEmail(value).html, /StoreCare HQ · <a href="https:\/\/www.storecarehq.com"[^>]*>storecarehq.com<\/a>/);
});

test('an agency without a client store gets a text-only introduction: no report buttons and no documents', () => {
  const pack = newPack(validateProspect({ agency_name: 'Glaze <Digital>', agency_url: 'glaze.example.com', contact_email: 'hello@glaze.example.com' }, { storeOptional: true }));
  pack.draft = noStoreDraftMessage(pack.prospect);
  const email = outreachEmail({ pack, subject: TEXT_ONLY_SUBJECT });
  assert.equal(email.subject, 'A free health check for one of your Shopify clients');
  assert.equal(email.documents.length, 0);
  assert.doesNotMatch(email.html, /View the health check|Sample monthly report|outreach\/r\/|Create report links/);
  assert.match(email.html, /Glaze &lt;Digital&gt;/);
  assert.match(email.html, /Reply &quot;no&quot;/);
  assert.match(email.text, /^Hi there,/);
  assert.match(email.text, /couldn't find a store that I could confidently link to Glaze <Digital>/);
  assert.doesNotMatch(email.text, /outreach\/r\/|example data/);
  // It needs an introduction, and can't smuggle in report links or a check.
  assert.throws(() => outreachEmail({ pack: { ...pack, draft: ' ' }, subject: TEXT_ONLY_SUBJECT }), /introduction/);
  assert.throws(() => outreachEmail({ pack: { ...pack, links: input().pack.links }, subject: TEXT_ONLY_SUBJECT }), /no health check or report links/);
});

test('agencies added by hand or CSV still need a client store and its portfolio source', () => {
  assert.throws(() => validateProspect({ agency_name: 'A', agency_url: 'a.example.com' }), /client store URL/);
  assert.throws(() => validateProspect({ agency_name: 'A', agency_url: 'a.example.com', client_store_url: 'store.example.com' }, { storeOptional: true }), /portfolio source/);
});

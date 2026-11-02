import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertEmailHtml, parseAlertText } from '../src/email-template.ts';
import { describeCheckoutFailure } from '../src/jobs/checkout.ts';
import { reportDigestSubject } from '../src/tasks.ts';

test('report digests read as a period, not a date', () => {
  assert.equal(reportDigestSubject('October 2026', ['Evzento']), 'October 2026 report for Evzento is ready to review');
  assert.equal(reportDigestSubject('October 2026', ['A', 'B', 'C']), 'October 2026 reports for 3 stores are ready to review');
});

test('a digest becomes a list of stores, a button and the approval note', () => {
  const subject = 'October 2026 reports for 2 stores are ready to review';
  const text = `${subject}.\nThey were drafted from last month's checks, changes and work log.\nNothing goes to clients until you approve and send.\n\n• Alpha: https://app.storecarehq.com/reports/1\n• Beta: https://app.storecarehq.com/reports/2\n\nAll reports: https://app.storecarehq.com/reports?period=2026-10`;
  const e = parseAlertText(subject, text);
  assert.equal(e.title, subject);
  assert.equal(e.lead, "They were drafted from last month's checks, changes and work log.");
  assert.deepEqual(e.items.map((i) => i.name), ['Alpha', 'Beta']);
  assert.equal(e.action?.url, 'https://app.storecarehq.com/reports?period=2026-10');
  assert.match(e.note, /Nothing goes to clients/);
  assert.deepEqual(e.paragraphs, []);
});

test('an alert names the store, explains the problem and links to it', () => {
  const e = parseAlertText('[evzento.com] Checkout test failed', 'evzento.com: Checkout test failed\nOn mobile, the home page did not load\nhttps://www.storecarehq.com/stores/abc');
  assert.equal(e.label, 'EVZENTO.COM');
  assert.equal(e.tone, 'alert');
  assert.equal(e.title, 'Checkout test failed');
  assert.equal(e.lead, 'On mobile, the home page did not load.');
  assert.equal(e.action?.url, 'https://www.storecarehq.com/stores/abc');
  assert.equal(parseAlertText('[x] Store is back up', 'x: Store is back up\nThe latest check passed.').tone, 'ok');
});

test('the HTML escapes store-controlled text and drops non-https links', () => {
  const html = alertEmailHtml('[<b>Shop</b>] Store is down', '<b>Shop</b>: Store is down\n<script>alert(1)</script>\njavascript:alert(1)');
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<b>Shop'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!/href="javascript/.test(html));
  assert.match(html, /StoreCare HQ/);
});

test('checkout failures are explained in plain English, once per distinct reason', () => {
  const sold = { failedStep: 'product' as const, detail: 'no available variant' };
  assert.equal(describeCheckoutFailure([{ device: 'mobile', ...sold }, { device: 'desktop', ...sold }], 'tee'),
    'On mobile and desktop, the test product “tee” is sold out, so nothing could be added to the basket. Choose an in-stock product under Checkout test in the store’s settings');
  assert.equal(describeCheckoutFailure([{ device: 'mobile', failedStep: 'home', detail: 'HTTP 503' }, { device: 'desktop', failedStep: 'checkout', detail: 'did not reach checkout (at x)' }], 'tee'),
    'On mobile, the home page did not load (the store answered with error 503). On desktop, the basket did not lead to the checkout page');
});

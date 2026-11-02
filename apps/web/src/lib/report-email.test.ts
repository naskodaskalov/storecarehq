import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brandColours, reportEmailHtml, reportEmailKey } from './report-email.ts';

test('a retry of the same report to the same address reuses the idempotency key', () => {
  const a = reportEmailKey('r1', '2026-11-01T06:00:00Z', 'Client@Store.com ');
  assert.equal(a, reportEmailKey('r1', '2026-11-01T06:00:00Z', 'client@store.com'));
  assert.notEqual(a, reportEmailKey('r1', '2026-11-02T06:00:00Z', 'client@store.com'), 'an edited, re-approved report is a new email');
  assert.notEqual(a, reportEmailKey('r1', '2026-11-01T06:00:00Z', 'other@store.com'));
  assert.ok(reportEmailKey('r'.repeat(300), 'v', 'x@y.z').length <= 256);
});


const base = { agencyName: 'Northline <Studio>', brandColor: '#0f766e', storeName: 'evzento.com', periodLabel: 'October 2026',
  summary: 'evzento.com ran smoothly in October 2026.\nNo incidents.', link: 'https://app.storecarehq.com/r/abc' };

test('the client email carries the agency brand, escapes text and links to the report', () => {
  const html = reportEmailHtml(base);
  assert.ok(html.includes('Northline &lt;Studio&gt;') && !html.includes('<Studio>'));
  assert.ok(html.includes('href="https://app.storecarehq.com/r/abc"'));
  assert.ok(html.includes('Your October 2026 care report'));
  assert.ok(!html.includes('Just reply'), 'no reply promise without a reply-to address');
  assert.ok(reportEmailHtml({ ...base, replyTo: 'hi@northline.com' }).includes('Just reply'));
  assert.ok(!reportEmailHtml({ ...base, brandColor: 'red;background:url(x)' }).includes('url(x)'));
});

test('button text stays readable on light and dark brand colours', () => {
  assert.equal(brandColours('#0f766e').onAccent, '#ffffff');
  assert.equal(brandColours('#f5d90a').onAccent, '#1d3034');
  assert.equal(brandColours('nope').accent, '#087f75');
});

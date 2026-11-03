import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityLines, type ActivityInput } from './activity.ts';

const now = new Date('2026-11-03T10:00:00Z');
const input: ActivityInput = {
  now,
  stores: [
    { id: 'a', name: 'Juniper & Ash', timezone: 'Europe/London' },
    { id: 'b', name: 'Ferro Coffee', timezone: 'Europe/Berlin' },
  ],
  changes: [
    { id: 7, store_id: 'a', occurred_at: '2026-11-02T09:14:00Z', summary: 'New live theme: “Dawn – Autumn”', risky: true, work_entry_id: 'w1' },
    { id: 8, store_id: 'b', occurred_at: '2026-11-01T11:40:00Z', summary: 'Prices changed on 18 products', risky: true, work_entry_id: null },
    { id: 9, store_id: 'b', occurred_at: '2026-10-28T13:05:00Z', summary: 'Smile.io added', risky: false, work_entry_id: null },
    { id: 10, store_id: 'gone', occurred_at: '2026-11-03T08:00:00Z', summary: 'Deleted store', risky: false, work_entry_id: null },
  ],
  incidents: [
    { id: 'x', store_id: 'b', kind: 'checkout', opened_at: '2026-11-03T06:02:00Z', resolved_at: '2026-11-03T06:31:00Z', cause: 'mobile: stuck at shipping' },
    { id: 'y', store_id: 'a', kind: 'down', opened_at: '2026-11-03T09:00:00Z', resolved_at: null, cause: null },
  ],
};

test('newest first, across stores, skipping stores the agency no longer has', () => {
  const lines = activityLines(input);
  assert.deepEqual(lines.map((l) => l.id), ['iy', 'rx', 'ix', 'c7', 'c8', 'c9']);
  assert.ok(!lines.some((l) => l.store === 'Deleted store'));
});

test('lines read like the change log: matched, flagged, fixed', () => {
  const by = Object.fromEntries(activityLines(input).map((l) => [l.id, l]));
  assert.equal(by.c7.text, 'New live theme: “Dawn – Autumn”, matched to your work log');
  assert.equal(by.c7.tone, 'plain');
  assert.equal(by.c8.text, 'Prices changed on 18 products, not in your work log');
  assert.ok(by.c8.flagged && by.c8.tone === 'risk');
  assert.equal(by.c9.flagged, false);
  assert.equal(by.rx.text, 'Checkout test passed again, fixed in 29 min');
  assert.equal(by.rx.tone, 'good');
  assert.equal(by.iy.text, 'Store unreachable · still open');
  assert.equal(by.c7.href, '/stores/a?change=7#change-details');
});

test('times are in each store’s zone, with Today and Yesterday', () => {
  const by = Object.fromEntries(activityLines(input).map((l) => [l.id, l]));
  assert.equal(by.ix.when, 'Today 07:02', 'Berlin is UTC+1 in November');
  assert.equal(by.c7.when, 'Yesterday 09:14');
  assert.equal(by.c9.when, '28 Oct 14:05');
});

test('limit keeps the newest lines', () => {
  assert.equal(activityLines({ ...input, limit: 2 }).length, 2);
});

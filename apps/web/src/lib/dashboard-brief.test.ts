import { test } from 'node:test';
import assert from 'node:assert/strict';
import { briefHeadline, briefItems, pace, type BriefInput } from './dashboard-brief.ts';

const now = new Date('2026-11-20T09:00:00Z'); // two thirds through November
const store = (id: string, over: Partial<BriefInput['stores'][number]> = {}) => ({ id, name: `Store ${id}`, status: 'active', included: 10, usedMinutes: 0, ...over });

test('pace forecasts month-end hours and flags plans heading over or going quiet', () => {
  assert.equal(pace({ included: 10, usedMinutes: 9 * 60 }, now).state, 'heading-over');
  assert.equal(pace({ included: 10, usedMinutes: 9 * 60 }, now).projected, 13.9);
  assert.equal(pace({ included: 10, usedMinutes: 6 * 60 }, now).state, 'on-pace');
  assert.equal(pace({ included: 10, usedMinutes: 60 }, now).state, 'quiet');
  assert.equal(pace({ included: 10, usedMinutes: 11 * 60 }, now).state, 'over');
  assert.equal(pace({ included: 0, usedMinutes: 60 }, now).state, 'no-plan');
  assert.equal(pace({ included: 10, usedMinutes: 300 }, new Date('2026-11-02T09:00:00Z')).state, 'early', 'no forecast in the first days');
});

test('the brief orders incidents, then checks and unexplained changes, then reports and pace', () => {
  const b: BriefInput = {
    now,
    stores: [store('a', { usedMinutes: 6 * 60 }), store('b', { usedMinutes: 9 * 60 }), store('c'), store('p', { status: 'paused', usedMinutes: 0 })],
    incidents: [{ id: 'i1', store_id: 'a', kind: 'checkout', cause: 'Stuck at shipping', opened_at: '2026-11-20T06:02:00Z' }],
    checkouts: [{ store_id: 'a', result: 'fail', ran_at: '2026-11-20T06:00:00Z' }, { store_id: 'c', result: 'fail', ran_at: '2026-11-20T06:00:00Z' }],
    changes: [{ id: 7, store_id: 'c', summary: 'New live theme: "Spring"', risky: true, work_entry_id: null, occurred_at: '2026-11-19T10:00:00Z' }, { id: 8, store_id: 'c', summary: 'Klaviyo added', risky: false, work_entry_id: null, occurred_at: '2026-11-19T10:00:00Z' }],
    reports: [{ id: 'r1', store_id: 'b', status: 'draft', period: '2026-10' }, { id: 'r2', store_id: 'a', status: 'sent', period: '2026-10' }],
  };
  const items = briefItems(b);
  assert.deepEqual(items.map((i) => i.key), ['incident-i1', 'checkout-c', 'change-7', 'report-r1', 'pace-b', 'pace-c']);
  assert.match(items[0].detail, /Stuck at shipping\. Open since 06:02 UTC/);
  assert.ok(!items.some((i) => i.store === 'Store p'), 'paused stores stay out of the brief');
  assert.equal(briefHeadline(b, items), '3 things need you now, 3 can wait until later. 1 of 3 stores needs nothing from you.');
});

test('a quiet morning says so', () => {
  const b: BriefInput = { now, stores: [store('a', { usedMinutes: 6 * 60 })], incidents: [], checkouts: [], changes: [], reports: [] };
  assert.deepEqual(briefItems(b), []);
  assert.equal(briefHeadline(b, []), 'Your store is quiet. Nothing needs you right now.');
});

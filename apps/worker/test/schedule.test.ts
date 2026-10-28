import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueJobs, localDateHour } from '../src/schedule.ts';

const at = (iso: string) => new Date(iso);
const consent = { timezone: 'Europe/Sofia', checkout_consent_at: at('2026-10-01T00:00:00Z') };
const none = { snapshotAt: null, checkoutAt: null, speedAt: null };

test('localDateHour uses the store timezone', () => {
  assert.deepEqual(localDateHour('Europe/Sofia', at('2026-10-28T22:30:00Z')), { date: '2026-10-29', hour: 0 });
  assert.deepEqual(localDateHour('America/New_York', at('2026-10-28T09:00:00Z')), { date: '2026-10-28', hour: 5 });
  assert.deepEqual(localDateHour('Not/AZone', at('2026-10-28T09:00:00Z')), { date: '2026-10-28', hour: 9 });
});

test('a new store gets uptime and a first snapshot; checkout waits for the snapshot', () => {
  assert.deepEqual(dueJobs(consent, none, at('2026-10-28T02:00:00Z')), ['uptime', 'storefront']); // 04:00 Sofia
});

test('storefront runs again after 50 minutes, not before', () => {
  const last = { ...none, snapshotAt: at('2026-10-28T02:00:00Z') };
  assert.ok(!dueJobs(consent, last, at('2026-10-28T02:30:00Z')).includes('storefront'));
  assert.ok(dueJobs(consent, last, at('2026-10-28T02:51:00Z')).includes('storefront'));
});

test('daily jobs run once per local day, from 06:00 store time', () => {
  const last = { ...none, snapshotAt: at('2026-10-28T03:30:00Z') };
  // 05:45 Sofia: too early
  assert.deepEqual(dueJobs(consent, last, at('2026-10-28T03:45:00Z')), ['uptime']);
  // 06:10 Sofia: checkout and speed due
  assert.deepEqual(dueJobs(consent, last, at('2026-10-28T04:10:00Z')), ['uptime', 'checkout', 'speed']);
  // later the same day: already done
  const done = { ...last, checkoutAt: at('2026-10-28T04:12:00Z'), speedAt: at('2026-10-28T04:13:00Z') };
  assert.deepEqual(dueJobs(consent, done, at('2026-10-28T10:00:00Z')).filter((j) => j !== 'storefront'), ['uptime']);
  // next local day after 06:00: due again
  assert.ok(dueJobs(consent, done, at('2026-10-29T04:30:00Z')).includes('checkout'));
});

test('no consent means no checkout test; a late run still catches up', () => {
  const noConsent = { ...consent, checkout_consent_at: null };
  const last = { ...none, snapshotAt: at('2026-10-28T09:00:00Z') };
  assert.deepEqual(dueJobs(noConsent, last, at('2026-10-28T09:20:00Z')), ['uptime', 'speed']);
  // A run that missed the 06:00 hour entirely still runs the daily jobs at 14:00.
  assert.ok(dueJobs(consent, last, at('2026-10-28T12:00:00Z')).includes('checkout'));
});

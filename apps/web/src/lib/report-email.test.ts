import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportEmailKey } from './report-email.ts';

test('a retry of the same report to the same address reuses the idempotency key', () => {
  const a = reportEmailKey('r1', '2026-11-01T06:00:00Z', 'Client@Store.com ');
  assert.equal(a, reportEmailKey('r1', '2026-11-01T06:00:00Z', 'client@store.com'));
  assert.notEqual(a, reportEmailKey('r1', '2026-11-02T06:00:00Z', 'client@store.com'), 'an edited, re-approved report is a new email');
  assert.notEqual(a, reportEmailKey('r1', '2026-11-01T06:00:00Z', 'other@store.com'));
  assert.ok(reportEmailKey('r'.repeat(300), 'v', 'x@y.z').length <= 256);
});

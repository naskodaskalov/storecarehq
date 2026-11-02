import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleMonthReport, SAMPLE_NOTICE } from './sample-month-report.ts';

test('sample uses previous month, including year boundaries, independent of run date', () => {
  assert.equal(sampleMonthReport('Agency', '2026-11-02T10:00:00Z').facts.period.start, '2026-10-01');
  assert.equal(sampleMonthReport('Agency', '2027-01-31T23:00:00Z').facts.period.start, '2026-12-01');
  assert.throws(() => sampleMonthReport('Agency', 'invalid'), /date/);
});
test('fictional report totals five hours and explicitly identifies illustrative content', () => {
  const { facts, summary } = sampleMonthReport('North Studio', '2026-11-02T10:00:00Z');
  assert.equal(facts.agencyName, 'North Studio');
  assert.equal(facts.work.hoursUsed, 5);
  assert.equal(facts.work.hoursIncluded, 10);
  assert.equal(facts.work.entries.reduce((n, w) => n + w.hours, 0), 5);
  assert.ok(facts.work.entries.every(w => w.text.startsWith('Sample:')));
  assert.match(facts.storeHost, /example\.com/);
  assert.ok(summary.startsWith(SAMPLE_NOTICE));
});

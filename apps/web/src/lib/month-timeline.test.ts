import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFacts, monthPeriod, type MonthData } from '@storecare/reports';
import { buildTimeline, dayKey, type TimelineInput } from './month-timeline.ts';

const period = monthPeriod('2026-10');

function input(over: Partial<TimelineInput> = {}): TimelineInput {
  const changes = [
    { id: 1, occurred_at: '2026-10-02T09:14:00Z', kind: 'theme_published', summary: 'New live theme: “Dawn – Autumn”', risky: true, work_entry_id: 'w1', work_title: 'Autumn theme' },
    { id: 2, occurred_at: '2026-10-17T13:05:00Z', kind: 'prices_changed', summary: 'Prices changed on 42 products', risky: true, work_entry_id: null },
  ];
  const incidents = [{ kind: 'checkout', opened_at: '2026-10-14T06:04:00Z', resolved_at: '2026-10-14T06:31:00Z', cause: 'mobile: shipping', client_note: 'A shipping app update; rolled back.' }];
  const runs = Array.from({ length: 31 }, (_, n) => ({ ran_at: `2026-10-${String(n + 1).padStart(2, '0')}T06:00:00Z`, result: n === 13 ? 'fail' : 'pass', device: 'mobile', failed_step: n === 13 ? 'shipping' : null }));
  const speed = Array.from({ length: 31 }, (_, n) => ({ sampled_at: `2026-10-${String(n + 1).padStart(2, '0')}T06:30:00Z`, performance_score: n < 22 ? 62 : 72, lcp_ms: n < 22 ? 3400 : 2600 }));
  const work = [
    { id: 'w1', work_date: '2026-10-02', minutes: 150, title: 'Autumn theme', client_text: 'Launched the autumn homepage and collections.', counts_to_plan: true, created_at: '2026-10-02T09:20:00Z' },
    { id: 'w2', work_date: '2026-10-20', minutes: 30, title: 'Internal call', client_text: null, counts_to_plan: false, created_at: '2026-10-21T08:00:00Z' },
  ];
  const data: MonthData = {
    period,
    store: { name: 'Juniper & Ash', public_url: 'https://juniperandash.com', health_score: 94, status: 'active', limited_reason: null },
    agency: { name: 'Northline Studio', brand_color: '#2747A8' },
    plan: { name: 'Growth', hours_included: 10, rollover_rule: 'none' },
    uptime: { checks: 1488, ok: 1487, avgMs: 412 },
    incidents,
    checkoutRuns: runs.map((r) => ({ ran_at: r.ran_at, result: r.result as 'pass' | 'fail' })),
    speed,
    changes,
    work,
    apps: [],
    previousMonthMinutes: null,
    asOf: '2026-11-01T00:00:00Z',
  };
  return { period, timeZone: 'Europe/London', now: new Date('2026-11-03T10:00:00Z'), facts: buildFacts(data), changes, incidents, runs, speed, work, ...over };
}

test('dayKey uses the store time zone', () => {
  assert.equal(dayKey('2026-10-14T23:30:00Z', 'UTC'), '2026-10-14');
  assert.equal(dayKey('2026-10-14T23:30:00Z', 'Europe/Sofia'), '2026-10-15');
});

test('a finished month has every day, each ending in what the report says', () => {
  const days = buildTimeline(input());
  assert.equal(days.length, 31);
  assert.ok(days.every((d) => !d.future && d.report.length > 0));
  assert.equal(days[0].weekday, 'Thu');
});

test('an incident day shows the failure, the alert and the fix, and its report line carries the client note', () => {
  const d14 = buildTimeline(input())[13];
  assert.deepEqual(d14.events.map((e) => e.tone), ['risk', 'risk', 'good']);
  assert.match(d14.events[0].text, /Checkout test failed on mobile at the shipping step/);
  assert.equal(d14.events[1].text, 'Checkout incident opened: mobile: shipping. Alert sent');
  assert.ok(d14.report.includes('Store health: checkout test 30/31, with this as the one failed run.'));
  assert.match(d14.events[2].text, /down for 27 min/);
  assert.ok(d14.report.some((l) => l === 'Incidents: checkout test failed on 14 Oct, fixed in 27 min, “A shipping app update; rolled back.”'));
});

test('changes say whether they match the work log and whether they made the report', () => {
  const days = buildTimeline(input());
  const theme = days[1].events.find((e) => e.changeId === 1)!;
  assert.equal(theme.tone, 'plain');
  assert.match(theme.text, /matched to your work log: Autumn theme/);
  assert.ok(days[1].report.some((l) => l.includes('marked as our work')));
  assert.ok(days[1].report.includes('Work we did (2.5 h, counted against the 10 h plan): “Launched the autumn homepage and collections.”'));
  const prices = days[16].events[0];
  assert.equal(prices.tone, 'risk');
  assert.ok(days[16].report.some((l) => l.includes('Flagged for you')));
});

test('internal work stays out of the report; speed jumps are called out', () => {
  const days = buildTimeline(input());
  assert.deepEqual(days[19].report, ['Internal work: stays out of the report.']);
  assert.equal(days[19].events[0].time, '', 'logged on another day, so no time');
  assert.match(days[22].events[0].text, /Mobile speed score up from 62 to 72/);
  assert.equal(days[22].speed, 72);
});

test('quiet days say what passed; days after today are future', () => {
  const days = buildTimeline(input({ now: new Date('2026-10-10T12:00:00Z') }));
  assert.equal(days.filter((d) => !d.future).length, 10);
  assert.match(days[4].quiet, /Checkout test passed on mobile\. No incidents, changes or work logged\. Mobile speed score 62\./);
  assert.match(days[4].report[0], /so far\. Nothing to explain/);
  assert.equal(days[20].quiet, 'Still to come.');
  assert.deepEqual(days[20].report, []);
});

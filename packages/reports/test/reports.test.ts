import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFacts, defaultReportPeriod, factsForPrompt, monthPeriod, previousPeriod, templateSummary, writeSummary, type MonthData } from '../src/index.ts';

const month = (over: Partial<MonthData> = {}): MonthData => ({
  period: monthPeriod('2026-10'),
  store: { name: 'Juniper & Ash', public_url: 'https://juniperandash.com', health_score: 94, status: 'active', limited_reason: null },
  agency: { name: 'Northline Studio', brand_color: '#2747A8' },
  plan: { name: 'Care Plan Growth', hours_included: 10, rollover_rule: 'one_month' },
  uptime: { checks: 1000, ok: 999 },
  incidents: [{ kind: 'checkout', opened_at: '2026-10-14T06:12:00Z', resolved_at: '2026-10-14T06:46:00Z', cause: 'x', client_note: null }],
  checkoutRuns: [
    ...Array.from({ length: 13 }, (_, i) => ({ ran_at: `2026-10-${String(i + 1).padStart(2, '0')}T06:00:00Z`, result: 'pass' as const })),
    { ran_at: '2026-10-14T06:00:00Z', result: 'fail' as const },
  ],
  speed: [
    { sampled_at: '2026-10-01T06:00:00Z', performance_score: 61, lcp_ms: 3400 },
    { sampled_at: '2026-10-27T06:00:00Z', performance_score: 74, lcp_ms: 2900 },
  ],
  changes: [
    { occurred_at: '2026-10-02T10:00:00Z', kind: 'theme_published', summary: 'New live theme: "Dawn – Autumn"', risky: true, work_entry_id: 'w1' },
    { occurred_at: '2026-10-07T10:00:00Z', kind: 'prices_changed', summary: 'Prices changed on 42 products', risky: true, work_entry_id: null },
    { occurred_at: '2026-10-17T10:00:00Z', kind: 'app_added', summary: 'Smile.io added', risky: false, work_entry_id: null },
    { occurred_at: '2026-10-21T10:00:00Z', kind: 'app_removed', summary: 'Privy removed', risky: false, work_entry_id: 'w2' },
    { occurred_at: '2026-10-25T10:00:00Z', kind: 'products_added', summary: '3 new products published', risky: false, work_entry_id: null },
    { occurred_at: '2026-10-26T10:00:00Z', kind: 'products_added', summary: '1 new product published', risky: false, work_entry_id: null },
  ],
  work: [
    { id: 'w1', work_date: '2026-10-02', minutes: 90, title: 'Published autumn theme', client_text: 'Launched the autumn homepage.', counts_to_plan: true },
    { id: 'w2', work_date: '2026-10-21', minutes: 45, title: 'Removed apps', client_text: null, counts_to_plan: true },
    { id: 'w3', work_date: '2026-10-22', minutes: 30, title: 'Internal call', client_text: null, counts_to_plan: false },
  ],
  apps: [{ key: 'klaviyo', name: 'Klaviyo', known: true }],
  previousMonthMinutes: 480,
  ...over,
});

test('periods', () => {
  assert.deepEqual(monthPeriod('2026-12-15'), { start: '2026-12-01', end: '2027-01-01', label: 'December 2026' });
  assert.equal(previousPeriod(monthPeriod('2026-01')).label, 'December 2025');
  assert.equal(defaultReportPeriod(new Date('2026-11-03T10:00:00Z')).label, 'October 2026');
  assert.equal(defaultReportPeriod(new Date('2026-10-28T10:00:00Z')).label, 'October 2026');
});

test('facts: uptime, checkout, speed, hours and rollover', () => {
  const f = buildFacts(month());
  assert.equal(f.uptimePct, 99.9);
  assert.deepEqual(f.checkout, { runs: 14, passed: 13, failed: 1, blocked: 0 });
  assert.deepEqual(f.speed, { lcpStart: 3400, lcpEnd: 2900, scoreEnd: 74 });
  assert.equal(f.incidents[0].minutesToFix, 34);
  assert.equal(f.work.hoursUsed, 2.3); // 135 billable minutes
  assert.equal(f.work.rolledOver, 2); // 10h plan, 8h used last month
  assert.equal(f.work.entries[0].text, 'Launched the autumn homepage.', 'client wording wins over internal title');
});

test('facts: change highlights are risky first, then agency work, max 5', () => {
  const f = buildFacts(month());
  assert.equal(f.changes.total, 6);
  assert.equal(f.changes.highlights.length, 5);
  assert.deepEqual(
    f.changes.highlights.map((c) => c.summary),
    ['Prices changed on 42 products', 'New live theme: "Dawn – Autumn"', 'Privy removed', '1 new product published', '3 new products published'],
  );
});

test('recommendations follow the rules and stop at three', () => {
  const f = buildFacts(month());
  assert.deepEqual(f.recommendations.map((r) => r.title), ['Speed up the home page on mobile', 'Tell us before big changes', 'Keep the daily checkout test on']);
  const quiet = buildFacts(month({ speed: [], changes: [], checkoutRuns: [] }));
  assert.deepEqual(quiet.recommendations, []);
});

test('empty month still produces a sensible report', () => {
  const f = buildFacts(month({ uptime: { checks: 0, ok: 0 }, incidents: [], checkoutRuns: [], speed: [], changes: [], work: [], previousMonthMinutes: null }));
  assert.equal(f.uptimePct, null);
  assert.equal(f.checkout, null);
  assert.equal(f.speed, null);
  const s = templateSummary(f);
  assert.match(s, /monitored by us throughout October 2026/);
  assert.equal(s.split('. ').length, 3);
});

test('template summary uses only the facts', () => {
  const s = templateSummary(buildFacts(month()));
  assert.match(s, /99\.9% of the time in October 2026, with 1 incident/);
  assert.match(s, /2 tasks \(2\.3h of 10h in your plan\), the largest being "Launched the autumn homepage"\./);
  assert.doesNotMatch(s, /internal call/i);
  assert.match(s, /speed up the home page on mobile/);
});

test('prompt facts are compact and complete', () => {
  const p = factsForPrompt(buildFacts(month()));
  assert.match(p, /Uptime: 99\.9% across 1000 checks/);
  assert.match(p, /fixed in 34 min/);
  assert.match(p, /13 of 14 daily runs passed, 1 failed/);
});

test('writeSummary: no key uses the template; API errors fall back', async () => {
  const f = buildFacts(month());
  assert.equal((await writeSummary(f)).source, 'template');
  const failing = (async () => new Response('nope', { status: 529 })) as typeof fetch;
  const r = await writeSummary(f, { apiKey: 'k', fetchImpl: failing });
  assert.equal(r.source, 'template');
  assert.match(r.error ?? '', /529/);
});

test('writeSummary: sends the facts to the API and returns its text', async () => {
  let sent: { model: string; system: string; messages: { content: string }[] } | null = null;
  const ok = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'All good this month.' }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const r = await writeSummary(buildFacts(month()), { apiKey: 'k', fetchImpl: ok });
  assert.deepEqual(r, { text: 'All good this month.', source: 'ai' });
  assert.equal(sent!.model, 'claude-haiku-5-5');
  assert.match(sent!.messages[0].content, /Uptime: 99\.9%/);
  assert.match(sent!.system, /Use only the facts given/);
});

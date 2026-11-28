import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portalUrl, buildPortal, durationLabel, newPortalToken, parseRequest, PORTAL_TOKEN, portalRawFromRows, requestErrorMessage, uptimeDays, type PortalRaw } from './client-portal.ts';

const NOW = new Date('2026-11-26T12:00:00Z');

function raw(over: Partial<PortalRaw> = {}): PortalRaw {
  return {
    generated_at: NOW.toISOString(),
    store: { name: 'Juniper & Ash', public_url: 'https://juniperandash.com', status: 'active', limited_reason: null, health_score: 94, timezone: 'Europe/London' },
    agency: { name: 'Northline Studio', brand_color: '#2747A8', logo_url: null },
    plan: { name: 'Care Plan Growth', hours_included: '10.00', rollover_rule: 'one_month' },
    month_start: '2026-11-01',
    minutes_this_month: 420,
    minutes_last_month: 480,
    work: [{ work_date: '2026-11-20', minutes: 90, text: 'Launched the autumn homepage' }],
    uptime_days: [{ day: '2026-11-25', checks: 48, ok: 48 }, { day: '2026-11-26', checks: 24, ok: 23 }],
    last_check: { checked_at: '2026-11-26T11:30:00Z', ok: true, ms: 320 },
    incidents: [],
    checkout: [{ device: 'mobile', result: 'pass', ran_at: '2026-11-26T07:00:00Z' }],
    checkout_30d: { runs: 30, passed: 29 },
    speed: { sampled_at: '2026-11-26T05:00:00Z', performance_score: 72, lcp_ms: 2440 },
    speed_before: { sampled_at: '2026-10-28T05:00:00Z', performance_score: 61, lcp_ms: 3100 },
    reports: [{ period: '2026-10-01', share_token: 'f'.repeat(64) }],
    requests: [{ subject: 'Gift wrap', status: 'in_progress', urgency: 'urgent', received_at: '2026-11-25T09:00:00Z', updated_at: null }],
    ...over,
  };
}

test('a healthy store reads as working, with hours including last month’s rollover', () => {
  const p = buildPortal(raw());
  assert.equal(p.status.tone, 'good');
  assert.equal(p.storeHost, 'juniperandash.com');
  assert.deepEqual(p.hours, { planName: 'Care Plan Growth', used: 7, included: 10, rolledOver: 2, available: 12, pct: 58, remaining: 5, over: 0 });
  assert.equal(p.monthLabel, 'November 2026');
  assert.equal(p.speed?.delta, 11);
  assert.equal(p.speed?.lcpSeconds, 2.4);
  assert.equal(p.checkout.passRate, 97);
  assert.equal(p.reports[0].label, 'October 2026');
  assert.equal(p.reports[0].href, `/r/${'f'.repeat(64)}`);
  assert.equal(p.openRequests, 1);
  assert.equal(p.requests[0].status, 'In progress');
  assert.equal(p.uptime.pct, 98.61, 'rounded down, never overstated');
});

test('an unanswered check or open down incident shows the store as down; checkout incidents show the agency note', () => {
  assert.equal(buildPortal(raw({ last_check: { checked_at: NOW.toISOString(), ok: false, ms: null } })).status.tone, 'bad');
  const p = buildPortal(raw({ incidents: [{ kind: 'checkout', opened_at: '2026-11-26T02:00:00Z', resolved_at: null, client_note: 'Payment app update; rolling back.' }] }));
  assert.equal(p.status.tone, 'warn');
  assert.equal(p.status.detail, 'Payment app update; rolling back.');
  assert.equal(p.incidents[0].open, true);
  assert.equal(buildPortal(raw({ store: { ...raw().store, status: 'paused' } })).status.title, 'Monitoring is paused');
  assert.equal(buildPortal(raw({ last_check: null })).status.tone, 'none');
});

test('expiring plans have no rollover and overage is reported, not hidden', () => {
  const p = buildPortal(raw({ plan: { name: 'Essentials', hours_included: 4, rollover_rule: 'expire' }, minutes_this_month: 330 }));
  assert.equal(p.hours?.rolledOver, 0);
  assert.equal(p.hours?.pct, 100);
  assert.equal(p.hours?.over, 1.5);
  assert.equal(buildPortal(raw({ plan: null })).hours, null);
});

test('thirty uptime cells end today, with gaps marked as no checks', () => {
  const days = uptimeDays([{ day: '2026-11-26', checks: 10, ok: 9 }], NOW);
  assert.equal(days.length, 30);
  assert.equal(days.at(-1)?.day, '2026-11-26');
  assert.equal(days.at(-1)?.tone, 'bad');
  assert.equal(days[0].tone, 'none');
  assert.match(days[0].label, /no checks/);
});

test('an unknown brand colour falls back to the default', () => {
  assert.equal(buildPortal(raw({ agency: { name: 'X', brand_color: 'red;}', logo_url: null } })).agency.color, '#2747A8');
});

test('durations read naturally', () => {
  assert.equal(durationLabel(34 * 60000), '34 min');
  assert.equal(durationLabel(125 * 60000), '2 h 5 min');
  assert.equal(durationLabel(72 * 3600e3), '3 days');
});

test('request forms are checked before they reach the database', () => {
  const form = (o: Record<string, string>) => new Map(Object.entries(o));
  const ok = parseRequest(form({ name: ' Maya ', email: 'Maya@Shop.com ', subject: ' Add   gift wrap ', body: '', urgency: 'urgent' }));
  assert.deepEqual(ok, { ok: true, value: { name: 'Maya', email: 'maya@shop.com', subject: 'Add gift wrap', body: null, urgency: 'urgent' } });
  assert.equal(parseRequest(form({ email: 'a@b.co', subject: '' })).ok, false);
  assert.equal(parseRequest(form({ email: 'nope', subject: 'Hi' })).ok, false);
  const anyUrgency = parseRequest(form({ email: 'a@b.co', subject: 'Hi', urgency: 'drop table' }));
  assert.equal(anyUrgency.ok && anyUrgency.value.urgency, 'normal');
  assert.match(requestErrorMessage('P0001: rate_limited'), /lot of requests/);
  assert.match(requestErrorMessage('boom'), /Something went wrong/);
});

test('tokens are 64 hex characters', () => {
  const t = newPortalToken();
  assert.match(t, PORTAL_TOKEN);
  assert.notEqual(t, newPortalToken());
});

test('demo rows produce the same shape the database function returns', () => {
  const token = 'c1'.repeat(32);
  const tables = {
    stores: [{ id: 's1', agency_id: 'a1', name: 'Juniper', public_url: 'https://j.com', status: 'active', limited_reason: null, health_score: 90, timezone: 'UTC', portal_token: token }],
    agencies: [{ id: 'a1', name: 'Northline', brand_color: '#2747A8' }],
    care_plans: [{ store_id: 's1', name: 'Plan', hours_included: 5, rollover_rule: 'expire' }],
    work_entries: [
      { store_id: 's1', work_date: '2026-11-20', minutes: 60, title: 'internal', client_text: 'Client text', counts_to_plan: true },
      { store_id: 's1', work_date: '2026-11-21', minutes: 60, title: 'private', client_text: null, counts_to_plan: false },
    ],
    uptime_checks: [{ store_id: 's1', checked_at: '2026-11-26T11:00:00Z', ok: true, ms: 300 }],
    requests: [{ store_id: 's1', subject: 'Hi', status: 'new', urgency: 'normal', received_at: '2026-11-26T10:00:00Z', from_email: 'secret@x.com' }],
    reports: [{ store_id: 's1', period: '2026-10-01', status: 'draft', share_token: 'x' }],
  };
  assert.equal(portalRawFromRows(tables, 'd'.repeat(64), NOW), null);
  const r = portalRawFromRows(tables, token, NOW)!;
  assert.equal(r.minutes_this_month, 60);
  assert.deepEqual(r.work.map((w) => w.text), ['Client text']);
  assert.equal(r.reports.length, 0);
  assert.ok(!JSON.stringify(r).includes('secret@x.com'));
  assert.equal(buildPortal(r).status.tone, 'good');
});

test('portal links are absolute: the app host in production, the current host elsewhere', () => {
  const t = 'c1'.repeat(32);
  assert.equal(portalUrl('www.storecarehq.com', t), `https://app.storecarehq.com/p/${t}`);
  assert.equal(portalUrl('app.storecarehq.com', t), `https://app.storecarehq.com/p/${t}`);
  assert.equal(portalUrl('localhost:3000', t), `http://localhost:3000/p/${t}`);
  assert.equal(portalUrl('storecare-git-x.vercel.app', t), `https://storecare-git-x.vercel.app/p/${t}`);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ago, demoMetrics, figure, funnelSteps, monitoringStatus, percent, revenue, signupStatus, usd, type RecentSignup } from './admin-metrics.ts';

test('MRR counts live paid plans at list price; the trial pipeline leaves out trials set to cancel', () => {
  const r = revenue({
    trialing: 3, active: 2, past_due: 1, cancelling: 1, ended: 4, no_card: 7,
    plans: [
      { status: 'active', plan: 'agency', cancelling: false, count: 1 },
      { status: 'active', plan: 'solo', cancelling: true, count: 1 },
      { status: 'past_due', plan: 'pro', cancelling: false, count: 1 },
      { status: 'trialing', plan: 'solo', cancelling: false, count: 2 },
      { status: 'trialing', plan: 'agency', cancelling: true, count: 1 },
      { status: 'active', plan: 'trial', cancelling: false, count: 1 }, // not a priced plan
    ],
  });
  assert.deepEqual(r, { mrr: 79 + 29 + 149, pipeline: 2 * 29, paying: 3, converting: 2 });
  assert.equal(usd(r.mrr), '$257');
});

test('the funnel shows each step against all sign-ups and against the step before', () => {
  const steps = funnelSteps({ signed_up: 40, confirmed: 36, workspace: 30, store: 24, trial: 12, paying: 6 });
  assert.deepEqual(steps.map((s) => s.label), ['Signed up', 'Confirmed email', 'Created a workspace', 'Added a store', 'Started a trial', 'Paying']);
  assert.equal(percent(steps[3].share), '60%');
  assert.equal(percent(steps[5].fromPrevious), '50%');
  assert.deepEqual(funnelSteps({ signed_up: 0, confirmed: 0, workspace: 0, store: 0, trial: 0, paying: 0 }).map((s) => [s.share, s.fromPrevious]), Array(6).fill([0, 0]));
});

test('a recent sign-up is labelled by how far they got, never by colour alone', () => {
  const base: RecentSignup = { email: 'a@b.co', created_at: '2026-11-02T10:00:00Z', confirmed: true, last_sign_in_at: null, workspace: 'Studio', plan: 'agency', subscription_status: 'trialing', cancel_at_period_end: false, trial_ends_at: '2026-11-09T22:30:00Z', stores: 2 };
  const tz = 'Europe/Sofia';
  assert.deepEqual(signupStatus(base, tz), { label: 'Agency trial · ends 10 Nov', tone: 'neutral' });
  assert.deepEqual(signupStatus({ ...base, cancel_at_period_end: true }, tz), { label: 'Agency trial · cancelling', tone: 'warning' });
  assert.deepEqual(signupStatus({ ...base, subscription_status: 'active', trial_ends_at: null }, tz), { label: 'Agency · paying', tone: 'success' });
  assert.deepEqual(signupStatus({ ...base, subscription_status: 'past_due' }, tz), { label: 'Agency · past due', tone: 'danger' });
  assert.deepEqual(signupStatus({ ...base, plan: 'trial', subscription_status: 'canceled' }, tz), { label: 'Subscription ended', tone: 'neutral' });
  assert.deepEqual(signupStatus({ ...base, subscription_status: null, stores: 0 }, tz), { label: 'No store yet', tone: 'neutral' });
  assert.deepEqual(signupStatus({ ...base, subscription_status: null }, tz), { label: 'No card yet', tone: 'neutral' });
  assert.deepEqual(signupStatus({ ...base, workspace: null }, tz), { label: 'No workspace yet', tone: 'neutral' });
  assert.deepEqual(signupStatus({ ...base, confirmed: false }, tz), { label: 'Email not confirmed', tone: 'warning' });
});

test('times read naturally and big numbers compact', () => {
  const now = '2026-11-03T12:00:00Z';
  assert.equal(ago('2026-11-03T11:59:40Z', now, 'UTC'), 'just now');
  assert.equal(ago('2026-11-03T11:48:00Z', now, 'UTC'), '12 min ago');
  assert.equal(ago('2026-11-03T07:00:00Z', now, 'UTC'), '5 h ago');
  assert.equal(ago('2026-10-30T12:00:00Z', now, 'UTC'), '4 days ago');
  assert.equal(ago('2026-09-01T12:00:00Z', now, 'UTC'), '1 Sept 2026');
  assert.equal(figure(1284), '1,284');
  assert.equal(figure(12_900), '12.9K');
});

test('monitoring reads as healthy or names the problem', () => {
  assert.deepEqual(monitoringStatus({ eligible: 3, stale: 0, last_check_minutes: 7, waiting_health_checks: 0 }), { ok: true, text: 'Last check 7 min ago' });
  assert.deepEqual(monitoringStatus({ eligible: 0, stale: 0, last_check_minutes: null, waiting_health_checks: 0 }), { ok: true, text: 'No checks yet' });
  assert.equal(monitoringStatus({ eligible: 3, stale: 2, last_check_minutes: 190, waiting_health_checks: 0 }).ok, false);
});

test('demo numbers are consistent with themselves', () => {
  const m = demoMetrics('Europe/Sofia', new Date('2026-11-03T12:00:00Z'));
  const live = m.subscriptions.plans.filter((p) => p.status === 'active').reduce((n, p) => n + p.count, 0);
  assert.equal(live, m.subscriptions.active);
  assert.equal(m.stores.active + m.stores.limited + m.stores.paused, m.stores.total);
  assert.ok(m.users.today <= m.users.week && m.users.week <= m.users.total);
});

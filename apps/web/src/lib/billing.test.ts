import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agencyUpdateFromSubscription, billingState, chargeFrom, checkoutTrial, planFromLookupKey, type BillingFields } from './billing.ts';

const now = new Date('2026-10-28T12:00:00Z');
const base: BillingFields = {
  plan: 'trial',
  trial_ends_at: '2026-11-03T12:00:00Z',
  subscription_status: null,
  current_period_end: null,
  cancel_at_period_end: false,
  stripe_customer_id: null,
  stripe_subscription_id: null,
};

test('trial: access, days left rounded up, 20 stores', () => {
  const s = billingState({ ...base, trial_ends_at: '2026-11-02T13:00:00Z' }, now);
  assert.equal(s.onTrial, true);
  assert.equal(s.hasAccess, true);
  assert.equal(s.trialDaysLeft, 6);
  assert.equal(s.storeLimit, 20);
});

test('trial over without a plan: no access', () => {
  const s = billingState({ ...base, trial_ends_at: '2026-10-27T12:00:00Z' }, now);
  assert.deepEqual([s.hasAccess, s.onTrial, s.trialDaysLeft], [false, false, 0]);
});

test('paying: plan limits; past_due keeps access; cancelled at period end shows the end date', () => {
  const solo = billingState({ ...base, plan: 'solo', subscription_status: 'active', trial_ends_at: '2026-10-01T00:00:00Z' }, now);
  assert.deepEqual([solo.hasAccess, solo.plan, solo.storeLimit, solo.onTrial], [true, 'solo', 5, false]);
  const late = billingState({ ...base, plan: 'pro', subscription_status: 'past_due' }, now);
  assert.deepEqual([late.hasAccess, late.pastDue, late.storeLimit], [true, true, 50]);
  const ending = billingState({ ...base, plan: 'agency', subscription_status: 'active', cancel_at_period_end: true, current_period_end: '2026-11-20T00:00:00Z' }, now);
  assert.equal(ending.endsAt, '2026-11-20T00:00:00Z');
  const canceled = billingState({ ...base, plan: 'trial', subscription_status: 'canceled', trial_ends_at: '2026-10-01T00:00:00Z' }, now);
  assert.equal(canceled.hasAccess, false);
});

test('a subscription maps to the plan from its price lookup key', () => {
  const sub = {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    items: { data: [{ price: { lookup_key: 'storecare_agency_monthly' }, current_period_end: 1795000000 }] },
  };
  assert.deepEqual(agencyUpdateFromSubscription(sub), {
    plan: 'agency',
    subscription_status: 'active',
    stripe_subscription_id: 'sub_1',
    stripe_customer_id: 'cus_1',
    current_period_end: new Date(1795000000 * 1000).toISOString(),
    cancel_at_period_end: false,
  });
  assert.equal(agencyUpdateFromSubscription({ ...sub, status: 'canceled' }).plan, 'trial');
  assert.equal(agencyUpdateFromSubscription({ ...sub, customer: { id: 'cus_2' } }).stripe_customer_id, 'cus_2');
  assert.equal(planFromLookupKey('something_else'), null);
});

test('subscribing mid-trial: first charge when the trial ends, unless that is under ~2 days away', () => {
  assert.equal(chargeFrom({ trial_ends_at: '2026-11-03T12:00:00Z' }, now), Date.parse('2026-11-03T12:00:00Z') / 1000);
  assert.equal(chargeFrom({ trial_ends_at: '2026-10-30T10:00:00Z' }, now), null);
  assert.equal(chargeFrom({ trial_ends_at: null }, now), null);
});

test('Stripe trial (card on file): on trial, paying, plan limits, days from the period end', () => {
  const s = billingState({ ...base, plan: 'solo', subscription_status: 'trialing', trial_ends_at: null, current_period_end: '2026-11-04T12:00:00Z', stripe_subscription_id: 'sub_1' }, now);
  assert.deepEqual([s.onTrial, s.cardOnFile, s.paying, s.hasAccess, s.trialDaysLeft, s.storeLimit, s.trialEndsAt], [true, true, true, true, 7, 5, '2026-11-04T12:00:00Z']);
});

test('new agency without a plan has no access; first checkout gets 7 days, a returning one none', () => {
  const fresh = { ...base, trial_ends_at: null };
  assert.equal(billingState(fresh, now).hasAccess, false);
  assert.deepEqual(checkoutTrial(fresh, now), { trial_period_days: 7 });
  assert.deepEqual(checkoutTrial({ ...fresh, stripe_subscription_id: 'sub_old' }, now), {});
  assert.deepEqual(checkoutTrial({ ...fresh, trial_ends_at: '2026-11-10T00:00:00Z' }, now), { trial_end: Date.parse('2026-11-10T00:00:00Z') / 1000 });
  assert.deepEqual(checkoutTrial({ ...fresh, trial_ends_at: '2026-10-20T00:00:00Z' }, now), {});
});

// The outreach sign-up offer: its window and trial end, and the signed cookie that carries it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentOffer, offerDay, offerKey, readOffer, sharedCookieDomain, signOffer } from './signup-offer.ts';

const NOV5 = Date.parse('2026-11-05T15:00:00Z');
const SNAPSHOT = '3f6c1a52-8a3e-4c1b-9a77-0d6c2b1e4f10';

test('the offer is open until the day before Black Friday and ends its trial at noon UTC on 2 December', () => {
  const o = currentOffer(NOV5);
  assert.ok(o);
  assert.equal(o.id, 'bfcm-2026');
  assert.equal(new Date(o.trialEnd).toISOString(), '2026-12-02T12:00:00.000Z');
  assert.equal(new Date(o.signupBy).toISOString(), '2026-11-27T00:00:00.000Z');
  assert.equal(offerDay(o.trialEnd), '2 December');
  assert.ok(currentOffer(Date.parse('2026-11-26T23:00:00Z')), 'Thanksgiving still counts');
  assert.equal(currentOffer(Date.parse('2026-11-27T08:00:00Z')), null, 'closed on Black Friday');
  assert.equal(currentOffer(Date.parse('2026-12-01T08:00:00Z')), null, 'and after the sale');
  assert.equal(currentOffer(Date.parse('2027-03-01T08:00:00Z')), null, 'not months ahead of next year’s');
  assert.equal(currentOffer(Date.parse('2027-10-01T08:00:00Z'))?.id, 'bfcm-2027', 'next season');
});

test('a signed offer reads back; altered, foreign-key, malformed and expired ones do not', () => {
  const o = currentOffer(NOV5)!;
  const offer = { id: o.id, snapshotId: SNAPSHOT, trialEnd: o.trialEnd, expires: o.signupBy };
  const value = signOffer(offer, 'key-a');
  assert.deepEqual(readOffer(value, 'key-a', NOV5), offer);
  assert.equal(readOffer(value, 'key-b', NOV5), null, 'another key');
  const longer = value.replace(`.${o.trialEnd}.`, `.${o.trialEnd + 30 * 864e5}.`);
  assert.equal(readOffer(longer, 'key-a', NOV5), null, 'a longer trial written into the cookie');
  assert.equal(readOffer(value, 'key-a', o.signupBy), null, 'past the sign-up date');
  for (const bad of [undefined, '', 'v1', 'v2.' + value.slice(3), value + '.x', value.replace(SNAPSHOT, 'not-a-uuid')]) assert.equal(readOffer(bad, 'key-a', NOV5), null);
  assert.equal(readOffer(value, null, NOV5), null, 'no key configured: no offer');
});

test('signing key: dedicated secret, else Stripe, demo fallback, otherwise off', () => {
  assert.equal(offerKey({ SIGNUP_OFFER_SECRET: 's', STRIPE_SECRET_KEY: 'k' }), 's');
  assert.equal(offerKey({ STRIPE_SECRET_KEY: 'k' }), 'k');
  assert.equal(offerKey({ STORECARE_DEMO: '1' }), 'storecare-demo-offer');
  assert.equal(offerKey({}), null);
});

test('the store cookie is shared by www. and app. in production only', () => {
  assert.equal(sharedCookieDomain('app.storecarehq.com'), '.storecarehq.com');
  assert.equal(sharedCookieDomain('storecarehq.com'), '.storecarehq.com');
  assert.equal(sharedCookieDomain('localhost:3100'), undefined);
  assert.equal(sharedCookieDomain('storecarehq.vercel.app'), undefined);
  assert.equal(sharedCookieDomain('evilstorecarehq.com'), undefined);
});

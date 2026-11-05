// The Black Friday offer for agencies that sign up from an outreach link: a free trial until two days after Cyber
// Monday (2 December in 2026) instead of 7 days. "Check all your client stores" on the hosted one-pager goes through
// /outreach/r/<token>/start, which sets it as a signed, expiring cookie; sign-up, onboarding, billing and Checkout read
// it. Server-only (node:crypto). Signed so that only someone who had an outreach link gets the longer trial.
// The offer's dates are pure and live in bfcm.ts, so client code (the outreach draft) can use them too.

import { createHmac, timingSafeEqual } from 'node:crypto';

export { currentOffer, offerDay, offerTrialEnd } from './bfcm.ts';

export const OFFER_COOKIE = 'sc_offer';
/** The store to prefill in onboarding. Also set by the landing-page check, shared by www. and app. in production. */
export const STORE_COOKIE = 'sc_store';

export type Offer = { id: string; snapshotId: string; trialEnd: number; expires: number };

/** The signing key: a dedicated secret if set, else the Stripe key (the offer only matters with Stripe). None: no offer. */
export function offerKey(env: Record<string, string | undefined> = process.env): string | null {
  return env.SIGNUP_OFFER_SECRET || env.STRIPE_SECRET_KEY || (env.STORECARE_DEMO === '1' ? 'storecare-demo-offer' : null);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const payload = (o: Offer) => `${o.id}.${o.snapshotId}.${o.trialEnd}.${o.expires}`;
const sign = (data: string, key: string) => createHmac('sha256', key).update(`storecare-signup-offer/v1/${data}`).digest('base64url');

export function signOffer(o: Offer, key: string): string {
  const data = payload(o);
  return `v1.${data}.${sign(data, key)}`;
}

/** The cookie's offer, or null when it is missing, altered, signed with another key or past its sign-up date. */
export function readOffer(value: string | undefined, key: string | null = offerKey(), now = Date.now()): Offer | null {
  if (!value || !key) return null;
  const parts = value.split('.');
  if (parts.length !== 6 || parts[0] !== 'v1') return null;
  const [, id, snapshotId, trialEnd, expires, signature] = parts;
  const offer = { id, snapshotId, trialEnd: Number(trialEnd), expires: Number(expires) };
  if (!/^bfcm-\d{4}$/.test(id) || !UUID.test(snapshotId) || !Number.isSafeInteger(offer.trialEnd) || !Number.isSafeInteger(offer.expires)) return null;
  const expected = Buffer.from(sign(payload(offer), key)), given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return now < offer.expires ? offer : null;
}

/** Cookies for both hosts in production (www. and app.), so the start route replaces a landing-page `sc_store`. */
export const sharedCookieDomain = (host: string) => (/(^|\.)storecarehq\.com$/i.test(host.split(':')[0]) ? '.storecarehq.com' : undefined);

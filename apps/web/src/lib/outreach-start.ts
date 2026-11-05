// "Check all your client stores" on a hosted outreach link (/outreach/r/<token>/start): the cookies that carry the
// client store, and until Black Friday the signed offer, into sign-up and onboarding. A link that is unknown, expired
// or revoked still opens sign-up, just without them.

import { readStartTarget, type ReportStore } from './outreach-report-links.ts';
import { currentOffer, offerKey, OFFER_COOKIE, sharedCookieDomain, signOffer, STORE_COOKIE } from './signup-offer.ts';

export type StartCookie = { name: string; value: string; httpOnly: boolean; secure: boolean; sameSite: 'lax'; path: '/'; domain?: string; expires: Date };

export const SIGNUP_PATH = '/login?trial=1';

export async function startSignup(
  token: string,
  store: ReportStore,
  opts: { host: string; secure: boolean; now?: number; key?: string | null },
): Promise<{ location: string; cookies: StartCookie[] }> {
  const now = opts.now ?? Date.now();
  const target = await readStartTarget(token, store, now);
  if (!target) return { location: SIGNUP_PATH, cookies: [] };
  // Readable by the landing page's script too (it sets the same cookie), so not httpOnly.
  const cookies: StartCookie[] = [{ name: STORE_COOKIE, value: target.host, httpOnly: false, secure: opts.secure, sameSite: 'lax', path: '/', domain: sharedCookieDomain(opts.host), expires: new Date(now + 7 * 864e5) }];
  const offer = currentOffer(now), key = opts.key === undefined ? offerKey() : opts.key;
  if (offer && key) {
    const value = signOffer({ id: offer.id, snapshotId: target.snapshotId, trialEnd: offer.trialEnd, expires: offer.signupBy }, key);
    cookies.push({ name: OFFER_COOKIE, value, httpOnly: true, secure: opts.secure, sameSite: 'lax', path: '/', expires: new Date(offer.signupBy) });
  }
  return { location: SIGNUP_PATH, cookies };
}

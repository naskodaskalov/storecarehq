// Reads the outreach offer cookie in server components and actions. Kept apart from signup-offer.ts so that file
// stays free of Next.js imports and runs under `node --test`.

import { cookies } from 'next/headers';
import { OFFER_COOKIE, readOffer, type Offer } from './signup-offer.ts';

/** The outreach offer saved in this browser by "Check all your client stores", if it is still valid. */
export async function offerFromCookies(now = Date.now()): Promise<Offer | null> {
  return readOffer((await cookies()).get(OFFER_COOKIE)?.value, undefined, now);
}

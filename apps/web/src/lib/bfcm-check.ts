// The landing page's free Black Friday readiness check: the prospect one-pager (bfcm.ts) for any public Shopify
// store, no sign-up. Same rules as the hero scan (scan.ts): same-origin only, rate-limited per visitor, public domain
// names only, nothing stored. It returns the audit, which holds findings in plain words, never page contents.

import { checkCertificate, domainExpiry, normalizeStoreUrl, probeStore } from '@storecare/storefront';
import { isProductionHost } from './domains.ts';
import { saleDates, type BfcmAudit } from './bfcm.ts';
import { pageSpeed, prospectAudit } from './quick-report.ts';

export type BfcmCheckReply = { ok: true; audit: BfcmAudit } | { ok: false; error: string };
type CheckConfig = { run: (url: string) => Promise<BfcmAudit | { error: string }>; allow: (key: string) => boolean; clientKey: string };

/** Three weeks before Black Friday through Cyber Monday: when the landing page shows the readiness check. */
export function bfcmLive(now = Date.now()): boolean {
  const s = saleDates(now);
  return s.phase !== 'before' || s.daysToBlackFriday <= 21;
}

function reply(status: number, body: BfcmCheckReply) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', ...(status === 429 ? { 'retry-after': '600' } : {}) } });
}

/** One outside look: storefront (with the products the home page promotes), certificate, domain and, when a
 *  PageSpeed key is set, a mobile speed test capped so the whole check answers in well under a minute. */
export async function runPublicAudit(baseUrl: string, now = Date.now): Promise<BfcmAudit | { error: string }> {
  const host = new URL(baseUrl).hostname;
  const speedRun = pageSpeed(`${baseUrl}/`, process.env.PAGESPEED_API_KEY, 25_000);
  const [probe, cert, domain] = await Promise.all([
    probeStore(baseUrl, { skipProducts: true, skipCart: true, featuredProducts: 3, gapMs: 250 }),
    checkCertificate(host).catch((e: Error) => ({ error: e.message })),
    domainExpiry(host).catch((e: Error) => ({ domain: host, error: e.message })),
  ]);
  const shown = new URL(baseUrl).host;
  if (probe.home.error && !probe.home.status) return { error: `We could not reach ${shown}. Check the address and try again.` };
  if (!probe.home.blocked && !probe.isShopify) return { error: 'This does not look like a Shopify store. Try the store’s own domain.' };
  const finalUrl = probe.finalUrl ? new URL(probe.finalUrl).origin : baseUrl;
  return prospectAudit({ probe, cert, domain, links: null, speed: await speedRun }, probe.siteName ?? new URL(finalUrl).hostname.replace(/^www\./, ''), finalUrl, now());
}

export async function handleBfcmCheck(request: Request, config: CheckConfig): Promise<Response> {
  const origin = request.headers.get('origin');
  const url = new URL(request.url);
  const host = request.headers.get('host') ?? url.host;
  const expectedOrigin = `${isProductionHost(host) ? 'https:' : url.protocol}//${host}`;
  if (!origin || origin !== expectedOrigin) return reply(403, { ok: false, error: 'Please run the check from the StoreCare website.' });

  let raw: unknown;
  try {
    const text = await request.text();
    if (text.length > 2000) return reply(413, { ok: false, error: 'That address is too long.' });
    raw = (JSON.parse(text) as { url?: unknown }).url;
  } catch {
    return reply(400, { ok: false, error: 'Enter a store address.' });
  }
  if (typeof raw !== 'string' || !raw.trim()) return reply(400, { ok: false, error: 'Enter a store address, like clientstore.com.' });

  let storeUrl: string;
  try {
    storeUrl = normalizeStoreUrl(raw);
  } catch {
    return reply(400, { ok: false, error: 'Enter a public store domain, like clientstore.com.' });
  }
  if (!config.allow(config.clientKey)) return reply(429, { ok: false, error: 'That is a lot of checks. Please wait ten minutes, or start a free trial to watch every client store through Cyber Monday.' });

  try {
    const audit = await config.run(storeUrl);
    if ('error' in audit) return reply(422, { ok: false, error: audit.error });
    return reply(200, { ok: true, audit });
  } catch {
    return reply(502, { ok: false, error: 'The check did not finish. Please try again in a moment.' });
  }
}

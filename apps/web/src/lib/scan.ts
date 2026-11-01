// The landing page's "Check any store" scan: one light pass over a public storefront, returned as a short summary.
// Public endpoint, so it is same-origin only, rate-limited per visitor, accepts public domain names only
// (normalizeStoreUrl rejects IPs, ports and internal names) and never returns page contents.

import { normalizeStoreUrl, type ProbeResult } from '@storecare/storefront';
import { isProductionHost } from './domains.ts';

export type ScanSummary = {
  ok: true;
  url: string;
  host: string;
  responseMs: number;
  theme: string | null;
  apps: string[];
  appCount: number;
  /** Third-party scripts we could not name. */
  unknownApps: number;
  products: { count: number; more: boolean } | null;
  soldOut: number | null;
  /** Why some checks would be limited for this store, in plain words. */
  note: string | null;
};
export type ScanReply = ScanSummary | { ok: false; error: string };

type ScanConfig = { probe: (url: string) => Promise<ProbeResult>; allow: (key: string) => boolean; clientKey: string };

function reply(status: number, body: ScanReply) {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', ...(status === 429 ? { 'retry-after': '600' } : {}) } });
}

export function summarize(r: ProbeResult): ScanReply {
  if (r.home.error && !r.home.status) return { ok: false, error: `We could not reach ${new URL(r.baseUrl).host}. Check the address and try again.` };
  if (!r.home.blocked && !r.isShopify) return { ok: false, error: 'This does not look like a Shopify store. Try the store’s own domain.' };
  const finalUrl = r.finalUrl ? new URL(r.finalUrl).origin : r.baseUrl;
  const feed = r.productFeed.status === 'ok' ? r.productFeed : null;
  // Recognised apps first: they mean something to an agency.
  const apps = [...r.apps].sort((a, b) => Number(b.known) - Number(a.known)).map((a) => a.name);
  const themeName = r.theme?.name ?? null;
  const theme = r.theme ? `${themeName ?? 'Custom theme'}${r.theme.schemaName && r.theme.schemaName !== themeName ? ` · ${r.theme.schemaName}` : ''}${r.theme.schemaVersion ? ` ${r.theme.schemaVersion}` : ''}` : null;
  return {
    ok: true,
    url: finalUrl,
    host: new URL(finalUrl).host.replace(/^www\./, ''),
    responseMs: r.home.ms,
    theme,
    apps: apps.slice(0, 8),
    appCount: apps.length,
    unknownApps: r.apps.filter((a) => !a.known).length,
    products: feed ? { count: feed.products.length, more: feed.truncated } : null,
    soldOut: feed ? feed.products.filter((p) => (p.soldOut?.length ?? 0) > 0).length : null,
    note: r.home.blocked
      ? 'The store’s firewall blocked our visit, so some checks would be limited.'
      : !r.theme
        ? 'Looks like a headless store: theme checks would be limited.'
        : !feed
          ? 'The product list is not public, so price and stock checks would be limited.'
          : null,
  };
}

export async function handleScan(request: Request, config: ScanConfig): Promise<Response> {
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
  if (!config.allow(config.clientKey)) return reply(429, { ok: false, error: 'That is a lot of checks. Please wait ten minutes, or start a free trial to watch stores all day.' });

  try {
    const result = summarize(await config.probe(storeUrl));
    return reply(result.ok ? 200 : 422, result);
  } catch {
    return reply(502, { ok: false, error: 'The check did not finish. Please try again in a moment.' });
  }
}

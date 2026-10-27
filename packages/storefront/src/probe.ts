// One pass over a store: what phase 1 can see from the public storefront.

import { normalizeStoreUrl, politeGet, type HostClock } from './http.ts';
import { detectApps, isShopifyPage, parseScripts, parseTheme, type DetectedApp, type ThemeInfo } from './page.ts';
import { fetchProductFeed, type ProductFeed } from './products.ts';
import { isAllowed, parseRobots, type Robots } from './robots.ts';
import type { Snapshot } from './diff.ts';

export type ProbeResult = {
  input: string;
  baseUrl: string;
  finalUrl: string | null;
  checkedAt: string;
  home: { status: number; ms: number; blocked: boolean; error?: string };
  isShopify: boolean;
  theme: ThemeInfo | null;
  apps: DetectedApp[];
  scriptCount: number;
  productFeed: ProductFeed | { status: 'skipped'; reason: string };
  cartJs: { status: number; blocked: boolean } | { status: 'skipped'; reason: string };
  robots: { found: boolean; homeAllowed: boolean; productsAllowed: boolean; cartAllowed: boolean; crawlDelay?: number };
};

export async function probeStore(
  input: string,
  opts: { gapMs?: number; maxProductPages?: number; skipProducts?: boolean; skipCart?: boolean } = {},
): Promise<ProbeResult> {
  const baseUrl = normalizeStoreUrl(input);
  const clock: HostClock = { last: 0 };
  const gapMs = opts.gapMs ?? 1000;

  const robotsRes = await politeGet(`${baseUrl}/robots.txt`, { clock, gapMs, accept: 'text/plain' });
  const robots: Robots = robotsRes.ok ? parseRobots(robotsRes.body) : { rules: [] };
  const effectiveGap = Math.max(gapMs, (robots.crawlDelay ?? 0) * 1000);
  const allowed = {
    home: isAllowed(robots, '/'),
    products: isAllowed(robots, '/products.json?limit=250&page=1'),
    cart: isAllowed(robots, '/cart.js'),
  };

  const home = allowed.home
    ? await politeGet(`${baseUrl}/`, { clock, gapMs: effectiveGap })
    : null;
  const html = home && !home.blocked ? home.body : '';
  const finalUrl = home?.url ?? null;
  const pageBase = finalUrl ? new URL(finalUrl).origin : baseUrl;
  const scripts = html ? parseScripts(html, pageBase) : [];

  const homeOk = !!home && !home.blocked && home.status === 200;
  const productFeed: ProbeResult['productFeed'] = !allowed.products
    ? { status: 'skipped', reason: 'disallowed by robots.txt' }
    : opts.skipProducts
      ? { status: 'skipped', reason: 'not due' }
      : !homeOk
        ? { status: 'skipped', reason: 'home page not readable' }
        : await fetchProductFeed(pageBase, { clock, gapMs: effectiveGap, maxPages: opts.maxProductPages });

  let cartJs: ProbeResult['cartJs'] = { status: 'skipped', reason: opts.skipCart ? 'not requested' : 'disallowed by robots.txt' };
  if (allowed.cart && !opts.skipCart && homeOk) {
    const c = await politeGet(`${pageBase}/cart.js`, { clock, gapMs: effectiveGap, accept: 'application/json' });
    cartJs = { status: c.status, blocked: c.blocked };
  }

  return {
    input,
    baseUrl,
    finalUrl,
    checkedAt: new Date().toISOString(),
    home: home
      ? { status: home.status, ms: home.ms, blocked: home.blocked, error: home.error }
      : { status: 0, ms: 0, blocked: false, error: 'disallowed by robots.txt' },
    isShopify: home ? isShopifyPage(home.body, home.headers) : false,
    theme: html ? parseTheme(html) : null,
    apps: detectApps(scripts, pageBase),
    scriptCount: scripts.length,
    productFeed,
    cartJs,
    robots: {
      found: robotsRes.ok,
      homeAllowed: allowed.home,
      productsAllowed: allowed.products,
      cartAllowed: allowed.cart,
      crawlDelay: robots.crawlDelay,
    },
  };
}

export function toSnapshot(r: ProbeResult): Snapshot {
  return {
    takenAt: r.checkedAt,
    theme: r.theme,
    apps: r.apps,
    products: r.productFeed.status === 'ok' ? r.productFeed.products : null,
  };
}

// What a storefront response says about the store's state: open, behind its password page, closed by Shopify,
// hidden from search, and which products the page promotes. Read from responses the probe already has.
//
// Verified on live stores (Nov 2026): a password-protected store redirects "/" to "/password", which answers 200
// with `Server-Timing: pageType;desc="password"` and a form posting to /password. Its product JSON answers 401.
// A closed or frozen store answers 404 with Shopify's "Store unavailable" page.

import { politeGet, type FetchResult, type HostClock } from './http.ts';
import { isAllowed, parseRobots, type Robots } from './robots.ts';

export type PageState = {
  /** Shopify's own name for the page it served (Server-Timing pageType): "index", "password", "product"… */
  pageType: string | null;
  /** The storefront password page is on: shoppers see a password form instead of the store. */
  password: boolean;
  /** Shopify's "Store unavailable" page: the store is closed, frozen or not set up. */
  unavailable: boolean;
  /** The page asks search engines not to index it, and where it says so. */
  noindex: 'meta' | 'header' | null;
  /** robots.txt stops Google's crawler from reading the home page. */
  googleBlocked: boolean;
  /** Products linked from the page, in page order with the main content first. */
  products: string[];
};

/** Shopify names the page type in its Server-Timing header: `pageType;desc="index"`. */
export function serverPageType(headers: Record<string, string>): string | null {
  return headers['server-timing']?.match(/(?:^|,)\s*pageType;desc="?([a-z0-9_-]+)"?/i)?.[1]?.toLowerCase() ?? null;
}

const head = (html: string) => {
  const end = html.search(/<\/head>/i);
  return html.slice(0, end > 0 ? end : 300_000);
};

export function isPasswordPage(finalUrl: string | null, headers: Record<string, string>, html: string): boolean {
  let path = '';
  try {
    path = finalUrl ? new URL(finalUrl).pathname.replace(/\/$/, '') : '';
  } catch {
    /* not a URL */
  }
  return path === '/password' || /^\/[a-z]{2}(-[a-z]{2,4})?\/password$/i.test(path) || serverPageType(headers) === 'password'
    || /<form\b[^>]*\baction\s*=\s*["'](?:\/[a-z]{2}(?:-[a-z]{2,4})?)?\/password["']/i.test(html);
}

export function isUnavailablePage(status: number, html: string): boolean {
  if (status === 200) return false;
  return /<title>\s*Store unavailable\b/i.test(html.slice(0, 20_000)) || /this store (?:is (?:currently )?unavailable|will be right back)/i.test(html.slice(0, 60_000));
}

const VALUE_DIRECTIVES = /^(unavailable_after|max-snippet|max-image-preview|max-video-preview)$/i;
const hidesPage = (directive: string) => /^(noindex|none)$/i.test(directive.trim());

/** X-Robots-Tag: "noindex", "noindex, nofollow", "googlebot: noindex". Rules for other named bots don't count. */
export function headerNoindex(value: string): boolean {
  let scope = '*';
  for (const raw of value.split(',')) {
    let directive = raw.trim();
    const named = directive.match(/^([a-z][\w-]*)\s*:\s*(.*)$/i);
    if (named && !VALUE_DIRECTIVES.test(named[1])) {
      scope = named[1].toLowerCase();
      directive = named[2];
    }
    if ((scope === '*' || scope === 'googlebot') && hidesPage(directive)) return true;
  }
  return false;
}

/** "noindex" (or "none") in a robots meta tag for all crawlers or Google, or in an X-Robots-Tag header. */
export function noindexSource(headers: Record<string, string>, html: string): 'meta' | 'header' | null {
  if (headerNoindex(headers['x-robots-tag'] ?? '')) return 'header';
  for (const tag of head(html).match(/<meta\b[^>]*>/gi) ?? []) {
    const name = tag.match(/\bname\s*=\s*["']?([a-z-]+)/i)?.[1]?.toLowerCase();
    if (name !== 'robots' && name !== 'googlebot') continue;
    const content = tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (content && (content[1] ?? content[2] ?? '').split(',').some(hidesPage)) return 'meta';
  }
  return null;
}

/** Google's crawler follows its own robots.txt group, or "*". */
export function blocksGoogle(robotsText: string | null): boolean {
  if (!robotsText) return false;
  return !isAllowed(parseRobots(robotsText, 'googlebot'), '/');
}

const NOT_A_HANDLE = /\.(js|json|oembed|xml|atom|jpe?g|png|gif|webp|avif|svg|css)$/i;

/** Product handles linked from a page: `/products/<handle>` paths in links, theme markup or menu data, on this store's
 *  own host. Main content first (featured collections, hero), then the rest of the page (menus). */
export function productHandles(html: string, pageUrl: string, limit = 12): string[] {
  let host = '';
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, '');
  } catch {
    return [];
  }
  const text = html.replace(/\\\//g, '/');
  const start = text.search(/<main\b/i);
  const end = start >= 0 ? text.indexOf('</main>', start) : -1;
  const parts = start >= 0 ? [text.slice(start, end > start ? end : undefined), text.slice(0, start), end > start ? text.slice(end) : ''] : [text];
  const re = /(?<=["'(=\s,]|^)(?:https?:\/\/([a-z0-9.-]+))?(?:\/[a-z]{2}(?:-[a-z]{2,4})?)?(?:\/collections\/[a-z0-9][\w%-]*)?\/products\/([a-z0-9][\w%.-]*)/gi;
  const out: string[] = [];
  for (const part of parts) {
    for (const m of part.matchAll(re)) {
      if (m[1] && m[1].toLowerCase().replace(/^www\./, '') !== host) continue;
      const handle = m[2].toLowerCase().replace(/\.+$/, '');
      if (!handle || NOT_A_HANDLE.test(handle) || out.includes(handle)) continue;
      out.push(handle);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export function readPageState(input: { finalUrl: string | null; status: number; headers: Record<string, string>; html: string; robotsText: string | null }): PageState {
  const password = isPasswordPage(input.finalUrl, input.headers, input.html);
  const unavailable = !password && isUnavailablePage(input.status, input.html);
  const readable = input.status === 200 && !password && !unavailable;
  return {
    pageType: serverPageType(input.headers),
    password,
    unavailable,
    noindex: readable ? noindexSource(input.headers, input.html) : null,
    googleBlocked: blocksGoogle(input.robotsText),
    products: readable && input.finalUrl ? productHandles(input.html, input.finalUrl) : [],
  };
}

export type ProductCheck = {
  handle: string;
  /** available: at least one variant can be bought. unreadable: blocked, an error, or not allowed by robots.txt. */
  state: 'available' | 'sold_out' | 'missing' | 'unreadable';
  title: string | null;
  status: number;
};

/** Reads each product's public JSON (/products/<handle>.js) to see whether it can be bought. Stops at a bot check. */
export async function checkProducts(
  origin: string,
  handles: string[],
  opts: { robots?: Robots; clock?: HostClock; gapMs?: number; timeoutMs?: number; get?: typeof politeGet } = {},
): Promise<ProductCheck[]> {
  const get = opts.get ?? politeGet;
  const out: ProductCheck[] = [];
  for (const handle of handles) {
    const path = `/products/${encodeURIComponent(handle)}.js`;
    if (opts.robots && !isAllowed(opts.robots, path)) {
      out.push({ handle, state: 'unreadable', title: null, status: 0 });
      continue;
    }
    const res: FetchResult = await get(`${origin}${path}`, { clock: opts.clock, gapMs: opts.gapMs ?? 1000, timeoutMs: opts.timeoutMs ?? 15000, accept: 'application/json' });
    if (res.status === 404) {
      out.push({ handle, state: 'missing', title: null, status: 404 });
      continue;
    }
    let json: { title?: unknown; available?: unknown; variants?: { available?: unknown }[] } | null = null;
    if (res.ok && !res.blocked) {
      try {
        json = JSON.parse(res.body);
      } catch {
        json = null;
      }
    }
    if (!json || typeof json !== 'object') {
      out.push({ handle, state: 'unreadable', title: null, status: res.status });
      if (res.blocked) break;
      continue;
    }
    const available = typeof json.available === 'boolean' ? json.available : Array.isArray(json.variants) && json.variants.some((v) => v?.available === true);
    out.push({ handle, state: available ? 'available' : 'sold_out', title: typeof json.title === 'string' ? json.title.slice(0, 120) : null, status: res.status });
  }
  return out;
}

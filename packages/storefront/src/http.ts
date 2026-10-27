// Polite HTTP for reading public storefronts.
// Every request identifies itself as StoreCareBot. We never disguise the client:
// if a store blocks the bot, we record that and show it to the agency.

export const USER_AGENT =
  'Mozilla/5.0 (compatible; StoreCareBot/0.1; +https://storecarehq.com/bot)';

export type FetchResult = {
  url: string;
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
  ms: number;
  error?: string;
  /** True when the response looks like a bot challenge or rate limit, not a real page. */
  blocked: boolean;
};

const BLOCK_STATUSES = new Set([401, 403, 429, 430, 503]);
const CHALLENGE_MARKERS = [
  'Verifying your connection',
  'cf-browser-verification',
  'challenge-platform',
  'Attention Required! | Cloudflare',
];

export function looksBlocked(status: number, body: string): boolean {
  if (BLOCK_STATUSES.has(status)) return true;
  const head = body.slice(0, 4000);
  return CHALLENGE_MARKERS.some((m) => head.includes(m));
}

export type HostClock = { last: number };

/** Waits so requests to one host are at least `gapMs` apart. */
export async function pace(clock: HostClock, gapMs: number): Promise<void> {
  const wait = clock.last + gapMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  clock.last = Date.now();
}

export async function politeGet(
  url: string,
  opts: { clock?: HostClock; gapMs?: number; timeoutMs?: number; accept?: string } = {},
): Promise<FetchResult> {
  if (opts.clock) await pace(opts.clock, opts.gapMs ?? 1000);
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'user-agent': USER_AGENT,
        accept: opts.accept ?? 'text/html,application/json;q=0.9,*/*;q=0.8',
      },
    });
    const body = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => (headers[k] = v));
    return {
      url: res.url || url,
      status: res.status,
      ok: res.ok,
      headers,
      body,
      ms: Date.now() - started,
      blocked: looksBlocked(res.status, body),
    };
  } catch (e) {
    return {
      url,
      status: 0,
      ok: false,
      headers: {},
      body: '',
      ms: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
      blocked: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Normalizes "juniperandash.com", "https://x.com/path" etc. to "https://host". */
export function normalizeStoreUrl(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const u = new URL(withScheme);
  return `https://${u.host.toLowerCase()}`;
}

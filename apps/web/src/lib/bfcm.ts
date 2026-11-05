// Black Friday / Cyber Monday readiness: one page per store saying what to fix before the sale.
// Pure and client-safe (type-only imports): built from a store's monitoring rows plus a light live check
// in the app, or from the quick report's live checks for a prospect. Missing or stale data is shown as
// "not checked" with its reason, never as a problem.

import type { PageState, ProbeResult, ProductCheck } from '@storecare/storefront';

const DAY = 864e5;

// ---------------------------------------------------------------------------------------------- Sale dates

const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** Black Friday: the day after the fourth Thursday of November (UTC date). */
function blackFridayOf(year: number): number {
  const firstThursday = 1 + ((4 - new Date(Date.UTC(year, 10, 1)).getUTCDay() + 7) % 7);
  return Date.UTC(year, 10, firstThursday + 22);
}

export type SaleDates = { blackFriday: string; cyberMonday: string; daysToBlackFriday: number; phase: 'before' | 'weekend' | 'cyber-monday' };

/** This year's sale until Cyber Monday is over, then next year's. */
export function saleDates(now = Date.now()): SaleDates {
  const today = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  let bf = blackFridayOf(new Date(now).getUTCFullYear());
  if (today > bf + 3 * DAY) bf = blackFridayOf(new Date(now).getUTCFullYear() + 1);
  const days = Math.round((bf - today) / DAY);
  return { blackFriday: fmt(bf), cyberMonday: fmt(bf + 3 * DAY), daysToBlackFriday: days, phase: days > 0 ? 'before' : days > -3 ? 'weekend' : 'cyber-monday' };
}

/** Two months before Black Friday through Cyber Monday: when the app shows the audit in its menu and Overview. */
export const inSeason = (now = Date.now()) => saleDates(now).daysToBlackFriday <= 60;

export function countdown(now = Date.now()): string {
  const s = saleDates(now);
  if (s.phase === 'cyber-monday') return 'Cyber Monday is today';
  if (s.phase === 'weekend') return s.daysToBlackFriday === 0 ? 'Black Friday is today' : 'Black Friday weekend';
  return s.daysToBlackFriday === 1 ? 'Black Friday is tomorrow' : `${s.daysToBlackFriday} days to Black Friday`;
}

/** "Fri 27 Nov" */
export const shortDate = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
/** "27 Nov 2026" */
export const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// ---------------------------------------------------------------------------------------------- The audit

export type Tone = 'fix' | 'look' | 'good' | 'unknown';
export type CheckKey = 'open' | 'search' | 'checkout' | 'uptime' | 'speed' | 'products' | 'links' | 'ssl' | 'domain' | 'apps' | 'changes';

export const CHECK_LABELS: Record<CheckKey, string> = {
  open: 'Open to shoppers',
  search: 'Google can list it',
  checkout: 'Checkout',
  uptime: 'Uptime',
  speed: 'Mobile speed',
  products: 'Products on the home page',
  links: 'Links',
  ssl: 'Security certificate',
  domain: 'Domain',
  apps: 'Apps and scripts',
  changes: 'Recent changes',
};

export type AuditItem = {
  key: CheckKey;
  tone: Tone;
  text: string;
  /** For fixes and looks: the finding as a short neutral phrase, to open an email with ("the password page is still on"). */
  short?: string;
};

export type BfcmAudit = {
  version: 1;
  /** store: a client store with monitoring history. prospect: one outside look at someone else's store. */
  kind: 'store' | 'prospect';
  storeName: string;
  host: string;
  url: string;
  checkedAt: string;
  sale: { blackFriday: string; cyberMonday: string };
  items: AuditItem[];
  fixes: number;
  looks: number;
  /** partial: the storefront itself couldn't be read, so the audit can't call the store ready. */
  verdict: 'fix' | 'look' | 'ready' | 'partial';
};

/** What one live visit saw (the storefront probe, without the product feed). null: the visit didn't happen. */
export type LiveCheck = {
  status: number;
  ms: number;
  blocked: boolean;
  error?: string;
  page: PageState | null;
  apps: { name: string; known: boolean }[];
  featured: ProductCheck[];
};

export function liveFromProbe(p: ProbeResult): LiveCheck {
  return {
    status: p.home.status,
    ms: p.home.ms,
    blocked: p.home.blocked,
    ...(p.home.error ? { error: p.home.error } : {}),
    page: p.page ?? null,
    apps: p.apps.map((a) => ({ name: a.name, known: a.known })),
    featured: p.featured ?? [],
  };
}

type Dated = { at: string };
export type AuditInput = {
  kind: 'store' | 'prospect';
  storeName: string;
  url: string;
  now: number;
  live: LiveCheck | null;
  /** In-app only: the daily checkout test, open incidents, 30-day uptime and recent changes. */
  checkout?: { consent: boolean; runs: { ran_at: string; result: string; device: string; failed_step: string | null }[] };
  incidents?: { kind: string; opened_at: string; cause: string | null }[];
  uptime?: { checks: number; ok: number } | null;
  changes?: { kind: string; occurred_at: string; summary: string }[];
  speed: (Dated & { performance: number | null; lcpMs: number | null; field?: string | null; fieldLcpMs?: number | null }) | { error: string } | null;
  ssl: (Dated & { expiresAt: string | null; error: string | null }) | null;
  domain: (Dated & { name: string | null; expiresAt: string | null; error: string | null }) | null;
  links: (Dated & { checked: number; broken: { url: string; status: number }[] }) | null;
};

/** Monitoring data older than this is "not checked recently" rather than a result. */
export const FRESH_DAYS = 3;
export const MANY_APPS = 12;
export const UPTIME_TARGET = 99.5;
const SSL_WARN_DAYS = 14;
const DOMAIN_WARN_DAYS = 45;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const path = (url: string) => {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
};
const list = (names: string[], max = 2) => names.slice(0, max).join(', ') + (names.length > max ? ` and ${names.length - max} more` : '');
const quote = (s: string) => `“${s}”`;

export function buildBfcmAudit(input: AuditInput): BfcmAudit {
  const { now, live } = input;
  const sale = saleDates(now);
  const saleEnd = Date.parse(`${sale.cyberMonday}T23:59:59Z`);
  const fresh = (at: string) => now - Date.parse(at) <= FRESH_DAYS * DAY;
  const host = new URL(input.url).hostname.replace(/^www\./, '');
  const prospect = input.kind === 'prospect';
  const items: AuditItem[] = [];
  const add = (key: CheckKey, tone: Tone, text: string, short?: string) => items.push({ key, tone, text, ...(short && tone !== 'good' && tone !== 'unknown' ? { short } : {}) });

  const page = live?.page ?? null;
  const readable = !!live && !live.blocked && live.status === 200 && !!page && !page.password && !page.unavailable;
  const notLoaded = !live ? 'Not checked: the live check did not run.'
    : live.blocked ? 'Not checked: the store’s firewall blocked our visit.'
    : page?.password ? 'Not checked while the password page is on.'
    : 'Not checked: the home page didn’t load.';

  // Open to shoppers: the live visit.
  if (!live) add('open', 'unknown', 'Not checked: the live check did not run. Try again in a minute.');
  else if (live.blocked) add('open', 'unknown', 'Not checked: the store’s firewall blocked our visit, so we couldn’t load the home page.');
  else if (live.error === 'disallowed by robots.txt') add('open', 'unknown', 'Not checked: the store’s robots.txt asks automated visitors not to load the home page.');
  else if (page?.password) add('open', 'fix', 'The password page is on, so shoppers can’t get into the store. Turn it off before the sale.', 'the password page is still on, so shoppers can’t get in');
  else if (page?.unavailable) add('open', 'fix', `Shopify shows ${quote('Store unavailable')} instead of the store. Check the plan and billing in the Shopify admin.`, `Shopify shows it as ${quote('Store unavailable')}`);
  else if (live.status === 200) add('open', 'good', `Open. The home page answered in ${secs(live.ms)}.`);
  // A visit that failed is worth a look but never a claim about the store: no short phrase for emails.
  else if (!live.status) add('open', 'look', `The home page didn’t answer when we checked${live.error ? ` (${live.error.slice(0, 80)})` : ''}. Worth loading it yourself.`);
  else add('open', 'look', `The home page answered with an error (HTTP ${live.status}) when we checked. Worth loading it yourself.`);

  // Google can list it: noindex and robots.txt.
  if (!readable) add('search', 'unknown', notLoaded);
  else if (page!.noindex) add('search', 'fix', `The home page tells search engines not to list it (noindex in the ${page!.noindex === 'meta' ? 'page' : 'response header'}). Remove it before the sale.`, 'the home page tells Google not to list it');
  else if (page!.googleBlocked) add('search', 'fix', 'robots.txt stops Google from reading the store, so shoppers searching for it won’t find it.', 'its robots.txt stops Google from reading the store');
  else add('search', 'good', 'Google can read and list the home page.');

  // Checkout: the daily test checkout (in-app only).
  if (prospect || !input.checkout) add('checkout', 'unknown', 'Not tested: a test checkout needs the store owner’s OK.');
  else if (!input.checkout.consent) add('checkout', 'unknown', 'Not tested: the daily test checkout isn’t switched on for this store.');
  else {
    // The newest run on each device in the last two days decides: an older failure that has since passed doesn't.
    const recent = input.checkout.runs.filter((r) => now - Date.parse(r.ran_at) <= 2 * DAY).sort((a, b) => b.ran_at.localeCompare(a.ran_at));
    const newest = new Map<string, (typeof recent)[number]>();
    for (const r of recent) if (!newest.has(r.device)) newest.set(r.device, r);
    const runs = [...newest.values()];
    const fail = runs.find((r) => r.result === 'fail');
    if (!runs.length) add('checkout', 'unknown', 'No test checkout in the last 2 days. It runs every morning; check again tomorrow.');
    else if (fail) add('checkout', 'fix', `The latest test checkout failed${fail.failed_step ? ` at ${fail.failed_step.replace(/_/g, ' ')}` : ''} (${fail.device}, ${longDate(fail.ran_at)}). Fix it before the sale.`, 'the latest test checkout failed');
    else if (runs.every((r) => r.result === 'blocked')) add('checkout', 'unknown', 'The latest test checkout was stopped by the store’s bot protection.');
    else add('checkout', 'good', `The test checkout passed on ${longDate(runs[0].ran_at)} (${runs.map((r) => r.device).sort().join(' and ')}).`);
  }

  // Uptime (in-app only).
  if (!prospect) {
    const down = input.incidents?.find((i) => i.kind === 'down');
    const u = input.uptime;
    if (down) add('uptime', 'fix', `A store-down incident has been open since ${longDate(down.opened_at)}${down.cause ? `: ${down.cause.slice(0, 120)}` : ''}.`, 'the store has an open downtime incident');
    else if (!u || !u.checks) add('uptime', 'unknown', 'Not enough uptime checks yet.');
    else {
      const pct = (u.ok / u.checks) * 100;
      const shown = pct === 100 ? '100' : pct.toFixed(2);
      add('uptime', pct < UPTIME_TARGET ? 'look' : 'good', pct < UPTIME_TARGET ? `Up ${shown}% of the last 30 days. Find what caused the outages before sale traffic arrives.` : `Up ${shown}% of the last 30 days.`, `it was up ${shown}% of the last 30 days`);
    }
  }

  // Mobile speed.
  const sp = input.speed;
  if (!sp) add('speed', 'unknown', prospect ? 'Not measured.' : `No mobile speed test in the last ${FRESH_DAYS} days.`);
  else if ('error' in sp) add('speed', 'unknown', 'The mobile speed test didn’t finish.');
  else if (!fresh(sp.at)) add('speed', 'unknown', `No mobile speed test in the last ${FRESH_DAYS} days.`);
  else {
    const slowLab = (sp.lcpMs ?? 0) > 4000 || (sp.performance !== null && sp.performance < 50);
    const slowReal = sp.field === 'SLOW';
    const lab = [sp.lcpMs ? `main content shows after ${secs(sp.lcpMs)}` : null, sp.performance !== null ? `score ${sp.performance}/100` : null].filter(Boolean).join(', ');
    if (slowLab || slowReal) {
      add('speed', 'look', `Slow on mobile${lab ? `: ${lab}` : ''}${slowReal ? `${lab ? '; ' : ': '}real Chrome visitors rate it poor${sp.fieldLcpMs ? ` (${secs(sp.fieldLcpMs)})` : ''}` : ''}. Sale traffic makes it worse; trim heavy apps and images.`,
        sp.lcpMs ? `its mobile pages take ${secs(sp.lcpMs)} to show their main content` : 'it is slow on mobile');
    } else if (lab) add('speed', 'good', `${lab[0].toUpperCase()}${lab.slice(1)} on mobile.`);
    else add('speed', 'unknown', 'The mobile speed test returned no scores.');
  }

  // Products the home page promotes: in stock, and still there.
  const featured = live?.featured ?? [];
  if (!readable) add('products', 'unknown', notLoaded);
  else if (!page!.products.length) add('products', 'unknown', 'The home page doesn’t link to any products.');
  else if (!featured.length || featured.every((p) => p.state === 'unreadable')) add('products', 'unknown', 'Couldn’t read the products the home page links to.');
  else {
    const gone = featured.filter((p) => p.state === 'missing');
    const out = featured.filter((p) => p.state === 'sold_out');
    const ok = featured.filter((p) => p.state === 'available');
    const name = (p: ProductCheck) => p.title ?? p.handle;
    if (gone.length || out.length) {
      const parts = [
        out.length ? `Sold out but promoted on the home page: ${list(out.map(name), 3)}.` : '',
        gone.length ? `${gone.length === 1 ? 'A product' : `${gone.length} products`} the home page links to no longer ${gone.length === 1 ? 'exists' : 'exist'} (${list(gone.map((p) => `/products/${p.handle}`), 2)}).` : '',
      ].filter(Boolean);
      add('products', 'fix', `${parts.join(' ')} Restock or swap ${out.length + gone.length === 1 ? 'it' : 'them'} before the sale.`,
        out.length ? `the home page promotes ${quote(name(out[0]))}, which is sold out` : 'the home page links to a product that no longer exists');
    } else add('products', 'good', `In stock: ${plural(ok.length, 'product')} the home page promotes (${list(ok.map(name), 2)}).`);
  }

  // Links from the home page.
  const ln = input.links;
  if (!ln || !fresh(ln.at) || !ln.checked) add('links', 'unknown', prospect ? 'Not checked.' : 'Not checked recently. Links are checked daily.');
  else if (ln.broken.length) add('links', 'look', `${plural(ln.broken.length, 'link')} from the home page ${ln.broken.length === 1 ? 'is' : 'are'} broken: ${list(ln.broken.map((b) => `${path(b.url)} (${b.status})`), 3)}.`, `${plural(ln.broken.length, 'link')} on the home page ${ln.broken.length === 1 ? 'leads' : 'lead'} to an error page`);
  else add('links', 'good', `All ${ln.checked} links checked from the home page work.`);

  // Security certificate.
  const ssl = input.ssl;
  if (!ssl) add('ssl', 'unknown', 'Not checked.');
  else if (ssl.error || !ssl.expiresAt) add('ssl', 'look', `We couldn’t read the security certificate${ssl.error ? ` (${ssl.error.slice(0, 60)})` : ''}.`);
  else {
    const exp = Date.parse(ssl.expiresAt);
    const days = Math.floor((exp - now) / DAY);
    if (exp < now) add('ssl', 'fix', `The security certificate expired on ${longDate(ssl.expiresAt)}. Browsers warn shoppers away until it’s renewed.`, `its security certificate expired on ${longDate(ssl.expiresAt)}`);
    else if (exp <= saleEnd) add('ssl', 'fix', `The security certificate expires on ${longDate(ssl.expiresAt)}, before the sale ends. Check it’s renewing.`, `its security certificate expires on ${longDate(ssl.expiresAt)}`);
    else if (days <= SSL_WARN_DAYS) add('ssl', 'look', `The security certificate expires in ${plural(days, 'day')} (${longDate(ssl.expiresAt)}). Check it’s renewing.`, `its security certificate expires on ${longDate(ssl.expiresAt)}`);
    else add('ssl', 'good', `Valid until ${longDate(ssl.expiresAt)}.`);
  }

  // Domain registration.
  const dm = input.domain;
  if (!dm) add('domain', 'unknown', 'Not checked.');
  else if (!dm.expiresAt && !dm.error && dm.name?.endsWith('myshopify.com')) add('domain', 'good', 'Uses Shopify’s own address, so there is nothing to renew.');
  else if (!dm.expiresAt) add('domain', 'unknown', `The registry doesn’t publish a renewal date for ${dm.name ?? 'this domain'}.`);
  else {
    const exp = Date.parse(dm.expiresAt);
    const days = Math.floor((exp - now) / DAY);
    const d = dm.name ?? host;
    if (exp <= saleEnd + 7 * DAY) add('domain', 'fix', `The domain ${d} ${exp < now ? 'expired' : 'expires'} on ${longDate(dm.expiresAt)}, right around the sale. Renew it now.`, `the domain ${d} is due for renewal on ${longDate(dm.expiresAt)}`);
    else if (days <= DOMAIN_WARN_DAYS) add('domain', 'look', `The domain ${d} expires on ${longDate(dm.expiresAt)}. Make sure auto-renew is on.`, `the domain ${d} is due for renewal on ${longDate(dm.expiresAt)}`);
    else add('domain', 'good', `${d} is registered until ${longDate(dm.expiresAt)}.`);
  }

  // App weight on the home page.
  if (!readable) add('apps', 'unknown', notLoaded);
  else {
    const apps = live!.apps;
    const unknown = apps.filter((a) => !a.known).length;
    if (apps.length >= MANY_APPS) add('apps', 'look', `${apps.length} apps and services load on the home page. Remove any that aren’t earning their keep before the sale.`, `${apps.length} apps and services load on its home page`);
    else if (unknown >= 3) add('apps', 'look', `${unknown} scripts come from services we don’t recognise. Confirm each one is wanted before the sale.`, `${unknown} scripts on its home page come from services I couldn’t identify`);
    else add('apps', 'good', apps.length ? `A lean set of ${plural(apps.length, 'app')} on the home page.` : 'No third-party apps load on the home page.');
  }

  // Recent changes (in-app only): what to test, then freeze.
  if (!prospect) {
    const recent = (input.changes ?? []).filter((c) => now - Date.parse(c.occurred_at) <= 14 * DAY);
    const theme = recent.filter((c) => c.kind === 'theme_published').sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0];
    const apps = recent.filter((c) => c.kind === 'app_added');
    if (theme || apps.length) {
      const parts = [
        theme ? `A new theme went live on ${longDate(theme.occurred_at)}.` : '',
        apps.length ? `${plural(apps.length, 'app')} added in the last 14 days (${list(apps.map((c) => c.summary.replace(/ added$/, '')), 2)}).` : '',
      ].filter(Boolean);
      add('changes', 'look', `${parts.join(' ')} Test checkout with ${theme && !apps.length ? 'it' : 'them'} live, then freeze changes until after Cyber Monday.`, theme ? 'a new theme went live in the last two weeks' : `${plural(apps.length, 'app')} were added in the last two weeks`);
    } else add('changes', 'good', 'No new theme or apps in the last 14 days.');
  }

  const fixes = items.filter((i) => i.tone === 'fix').length;
  const looks = items.filter((i) => i.tone === 'look').length;
  const storefrontRead = items.find((i) => i.key === 'open')?.tone !== 'unknown';
  return {
    version: 1,
    kind: input.kind,
    storeName: input.storeName.slice(0, 120) || host,
    host,
    url: new URL(input.url).origin,
    checkedAt: new Date(now).toISOString(),
    sale: { blackFriday: sale.blackFriday, cyberMonday: sale.cyberMonday },
    items,
    fixes,
    looks,
    verdict: fixes ? 'fix' : !storefrontRead ? 'partial' : looks ? 'look' : 'ready',
  };
}

export function headline(a: Pick<BfcmAudit, 'fixes' | 'looks' | 'verdict'>): string {
  if (a.fixes) return `${plural(a.fixes, 'thing')} to fix before Black Friday`;
  if (a.verdict === 'partial') return 'Not fully checked: we couldn’t load the storefront';
  if (a.looks) return `Ready for Black Friday, with ${plural(a.looks, 'thing')} worth a look`;
  return 'Ready for Black Friday';
}

/** Things worth a look that are specific enough to open an email with. App weight and recent changes are not:
 *  an unrecognised script is often a wanted app, and a prospect's change history is unknown. */
const LEAD_LOOKS = new Set<CheckKey>(['speed', 'links', 'ssl', 'domain', 'uptime']);

/** The finding worth opening an email with: the first fix, else the first specific thing worth a look. */
export function leadFinding(a: BfcmAudit): string | null {
  return (a.items.find((i) => i.tone === 'fix' && i.short) ?? a.items.find((i) => i.tone === 'look' && i.short && LEAD_LOOKS.has(i.key)))?.short ?? null;
}

const TONES = new Set<Tone>(['fix', 'look', 'good', 'unknown']);
const KEYS = new Set(Object.keys(CHECK_LABELS));

/** Checks an audit read back from storage or a backup file before it is rendered or sent. */
export function validAudit(v: unknown): v is BfcmAudit {
  if (!v || typeof v !== 'object') return false;
  const a = v as Record<string, unknown>;
  const str = (x: unknown, max = 300) => typeof x === 'string' && x.length <= max;
  return a.version === 1 && (a.kind === 'store' || a.kind === 'prospect') && str(a.storeName) && str(a.host) && str(a.url) && /^https?:\/\//.test(String(a.url))
    && str(a.checkedAt) && Number.isFinite(Date.parse(String(a.checkedAt))) && !!a.sale && typeof a.sale === 'object'
    && /^\d{4}-\d{2}-\d{2}$/.test(String((a.sale as Record<string, unknown>).blackFriday)) && /^\d{4}-\d{2}-\d{2}$/.test(String((a.sale as Record<string, unknown>).cyberMonday))
    && Array.isArray(a.items) && a.items.length <= 20
    && a.items.every((i: unknown) => !!i && typeof i === 'object' && KEYS.has(String((i as AuditItem).key)) && TONES.has((i as AuditItem).tone) && str((i as AuditItem).text, 600) && ((i as AuditItem).short === undefined || str((i as AuditItem).short, 300)))
    && Number.isInteger(a.fixes) && Number.isInteger(a.looks) && ['fix', 'look', 'ready', 'partial'].includes(String(a.verdict));
}

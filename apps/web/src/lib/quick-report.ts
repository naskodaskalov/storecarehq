// The admin quick report: one deeper outside check of any Shopify store, without adding it to a workspace.
// Nothing is stored. It combines the landing-page scan with the daily site checks (SSL, domain, broken links),
// the cart check and, when PAGESPEED_API_KEY is set, one mobile PageSpeed test.

import {
  checkCertificate,
  daysUntil,
  domainExpiry,
  findBrokenLinks,
  normalizeStoreUrl,
  parseRobots,
  politeGet,
  probeStore,
  type BrokenLink,
  type CertInfo,
  type DomainInfo,
  type ProbeResult,
  type Robots,
} from '@storecare/storefront';
import { summarize, type ScanSummary } from './scan.ts';
import { checkupNote, findings, type Finding } from './scan-findings.ts';

export type Speed = { performance: number | null; seo: number | null; accessibility: number | null; lcpMs: number | null } | { error: string };

export type QuickReportInput = {
  probe: ProbeResult;
  cert: CertInfo | null;
  domain: DomainInfo | null;
  links: { checked: number; broken: BrokenLink[] } | null;
  speed: Speed | null;
  now?: number;
};

export type ReportSection = { title: string; items: Finding[] };

export type QuickReport =
  | {
      ok: true;
      host: string;
      url: string;
      siteName: string | null;
      checkedAt: string;
      summary: ScanSummary;
      sections: ReportSection[];
      looks: number;
      /** A plain note an agency can send the store owner, built from the findings. */
      note: string;
    }
  | { ok: false; error: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Ends a sentence without doubling a name's own final period ("Inc."). */
const end = (text: string) => (text.endsWith('.') ? text : `${text}.`);
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// Expiry windows worth a look: certificates renew late in their life, domains should be renewed well ahead.
export const SSL_WARN_DAYS = 14;
export const DOMAIN_WARN_DAYS = 45;

export function buildQuickReport(input: QuickReportInput, preparedBy = ''): QuickReport {
  const summary = summarize(input.probe);
  if (!summary.ok) return summary;
  const now = input.now ?? Date.now();
  const scan = findings(summary);
  const pick = (re: RegExp) => scan.filter((f) => re.test(f.text));

  // Speed: the home page response, plus PageSpeed when it ran.
  const speed: Finding[] = [...pick(/home page/)];
  const s = input.speed;
  if (s && 'error' in s) speed.push({ tone: 'look', text: 'The PageSpeed test did not finish. Run it again later for mobile scores.' });
  else if (s && s.performance !== null) {
    const lcp = s.lcpMs !== null ? ` Main content appeared after ${(s.lcpMs / 1000).toFixed(1)}s.` : '';
    speed.push({
      tone: s.performance >= 50 ? 'good' : 'look',
      text: `Mobile PageSpeed score ${s.performance}/100.${lcp}${s.performance < 50 ? ' Slow mobile pages cost sales.' : ''}`,
    });
    if (s.seo !== null) speed.push({ tone: s.seo >= 85 ? 'good' : 'look', text: `SEO basics score ${s.seo}/100.` });
    if (s.accessibility !== null) speed.push({ tone: s.accessibility >= 85 ? 'good' : 'look', text: `Accessibility score ${s.accessibility}/100.` });
  }

  // SSL and domain.
  const security: Finding[] = [];
  const c = input.cert;
  if (c && 'error' in c) security.push({ tone: 'look', text: `We could not read the SSL certificate (${c.error}).` });
  else if (c) {
    const d = daysUntil(c.expiresAt, now)!;
    security.push(
      d <= SSL_WARN_DAYS
        ? { tone: 'look', text: `The SSL certificate expires in ${plural(Math.max(d, 0), 'day')} (${day(c.expiresAt)}). Check it is renewing.` }
        : { tone: 'good', text: end(`SSL certificate valid until ${day(c.expiresAt)}${c.issuer ? `, issued by ${c.issuer}` : ''}`) },
    );
  }
  const dom = input.domain;
  if (dom && 'expiresAt' in dom && dom.expiresAt) {
    const d = daysUntil(dom.expiresAt, now)!;
    security.push(
      d <= DOMAIN_WARN_DAYS
        ? { tone: 'look', text: `The domain ${dom.domain} expires in ${plural(Math.max(d, 0), 'day')} (${day(dom.expiresAt)}). Confirm auto-renew is on.` }
        : { tone: 'good', text: end(`Domain ${dom.domain} registered until ${day(dom.expiresAt)}${dom.registrar ? ` with ${dom.registrar}` : ''}`) },
    );
  }

  // Links from the home page.
  const links: Finding[] = [];
  if (input.links && input.links.checked > 0) {
    const { broken, checked } = input.links;
    if (broken.length) {
      links.push({ tone: 'look', text: `${plural(broken.length, 'link')} from the home page ${broken.length === 1 ? 'is' : 'are'} broken (of ${checked} checked).` });
      for (const b of broken.slice(0, 8)) links.push({ tone: 'look', text: `${new URL(b.url).pathname} answers ${b.status}.` });
    } else links.push({ tone: 'good', text: `All ${checked} links checked from the home page work.` });
  }

  // Theme, apps, products, cart.
  const store: Finding[] = [...pick(/theme/i), ...pick(/apps? and services|lean set|script/)];
  if (summary.apps.length) store.push({ tone: 'good', text: `Apps spotted: ${summary.apps.join(', ')}${summary.appCount > summary.apps.length ? ` and ${summary.appCount - summary.apps.length} more` : ''}.` });
  if (summary.products) store.push({ tone: 'good', text: `${summary.products.more ? 'More than ' : ''}${plural(summary.products.count, 'product')} listed publicly.` });
  store.push(...pick(/sold-out/));
  const cart = input.probe.cartJs;
  if (typeof cart.status === 'number') {
    store.push(
      cart.status === 200 && !('blocked' in cart && cart.blocked)
        ? { tone: 'good', text: 'The cart answers normally.' }
        : { tone: 'look', text: `The cart did not answer normally (status ${cart.status}). Worth testing a checkout.` },
    );
  }
  if (summary.note) store.push({ tone: 'look', text: summary.note });

  const order = (list: Finding[]) => [...list.filter((f) => f.tone === 'look'), ...list.filter((f) => f.tone === 'good')];
  const sections = [
    { title: 'Speed', items: order(speed) },
    { title: 'SSL and domain', items: order(security) },
    { title: 'Links', items: order(links) },
    { title: 'Theme, apps and products', items: order(store) },
  ].filter((section) => section.items.length > 0);

  const all = sections.flatMap((section) => section.items);
  // The note leads with the headline finding per topic, not every broken URL.
  const noteItems = all.filter((f) => !/ answers \d+\.$/.test(f.text));
  return {
    ok: true,
    host: summary.host,
    url: summary.url,
    siteName: summary.siteName,
    checkedAt: input.probe.checkedAt,
    summary,
    sections,
    looks: all.filter((f) => f.tone === 'look').length,
    note: checkupNote(summary, preparedBy, noteItems),
  };
}

type PsiJson = {
  lighthouseResult?: { categories?: Record<string, { score?: number | null } | undefined>; audits?: Record<string, { numericValue?: number } | undefined> };
};

/** One mobile PageSpeed test. Returns null when no API key is configured. */
export async function pageSpeed(url: string, key = process.env.PAGESPEED_API_KEY, timeoutMs = 45000): Promise<Speed | null> {
  if (!key) return null;
  const api = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  api.searchParams.set('url', url);
  api.searchParams.set('strategy', 'mobile');
  for (const c of ['performance', 'seo', 'accessibility']) api.searchParams.append('category', c);
  api.searchParams.set('key', key);
  try {
    const res = await fetch(api, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return { error: `PageSpeed ${res.status}` };
    const lr = ((await res.json()) as PsiJson).lighthouseResult;
    const score = (k: string) => {
      const v = lr?.categories?.[k]?.score;
      return typeof v === 'number' ? Math.round(v * 100) : null;
    };
    const lcp = lr?.audits?.['largest-contentful-paint']?.numericValue;
    return { performance: score('performance'), seo: score('seo'), accessibility: score('accessibility'), lcpMs: typeof lcp === 'number' ? Math.round(lcp) : null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Runs every check for one store. Speed runs alongside the storefront checks so the whole report fits in a minute. */
export async function runQuickReport(input: string, preparedBy = ''): Promise<QuickReport> {
  let baseUrl: string;
  try {
    baseUrl = normalizeStoreUrl(input);
  } catch {
    return { ok: false, error: 'Enter a public store domain, like clientstore.com.' };
  }
  const host = new URL(baseUrl).hostname;
  const speedRun = pageSpeed(`${baseUrl}/`);
  const [probe, cert, domain] = await Promise.all([
    probeStore(baseUrl, { maxProductPages: 2, gapMs: 400 }),
    checkCertificate(host).catch((e: Error) => ({ error: e.message })),
    domainExpiry(host).catch((e: Error) => ({ domain: host, error: e.message })),
  ]);

  let links: QuickReportInput['links'] = null;
  if (probe.home.status === 200 && !probe.home.blocked) {
    const origin = probe.finalUrl ? new URL(probe.finalUrl).origin : baseUrl;
    const robotsRes = await politeGet(`${origin}/robots.txt`, { accept: 'text/plain' });
    const robots: Robots = robotsRes.ok ? parseRobots(robotsRes.body) : { rules: [] };
    const home = await politeGet(`${origin}/`, { gapMs: 400 });
    if (home.ok && !home.blocked) links = await findBrokenLinks(home.body, home.url || `${origin}/`, { robots, limit: 15, gapMs: 400 });
  }
  return buildQuickReport({ probe, cert, domain, links, speed: await speedRun }, preparedBy);
}

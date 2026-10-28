// Daily site checks from the outside: SSL certificate, domain registration, broken internal links.

import tls from 'node:tls';
import { politeGet, USER_AGENT, type HostClock } from './http.ts';
import { isAllowed, type Robots } from './robots.ts';

export type CertInfo = { expiresAt: string; issuer: string | null } | { error: string };

/** Reads the TLS certificate the store serves. */
export function checkCertificate(hostname: string, timeoutMs = 10000): Promise<CertInfo> {
  return new Promise((resolve) => {
    const socket = tls.connect({ host: hostname, port: 443, servername: hostname, timeout: timeoutMs }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert || !cert.valid_to) return resolve({ error: 'no certificate' });
      const issuer = (cert.issuer && (cert.issuer.O || cert.issuer.CN)) || null;
      resolve({ expiresAt: new Date(cert.valid_to).toISOString(), issuer: Array.isArray(issuer) ? issuer[0] : issuer });
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ error: 'timeout' });
    });
    socket.on('error', (e) => resolve({ error: e.message }));
  });
}

/** The registrable domain: "shop.example.co.uk" → "example.co.uk", "www.example.com" → "example.com". */
export function registrableDomain(hostname: string): string {
  const parts = hostname.toLowerCase().replace(/\.$/, '').split('.');
  const twoPartSuffix = /^(co|com|org|net|gov|ac|edu|ltd|plc)$/.test(parts.at(-2) ?? '') && (parts.at(-1)?.length ?? 0) === 2;
  return parts.slice(twoPartSuffix ? -3 : -2).join('.');
}

export type DomainInfo = { domain: string; expiresAt: string | null; registrar: string | null } | { domain: string; error: string };

type RdapEvent = { eventAction?: string; eventDate?: string };
type RdapEntity = { roles?: string[]; vcardArray?: [string, [string, unknown, string, string][]] };

const RDAP_HEADERS = { accept: 'application/rdap+json, application/json', 'user-agent': USER_AGENT };
let bootstrap: Promise<[string[], string[]][] | null> | null = null;

/** IANA's official list of which registry runs RDAP for each top-level domain. Fetched once per process. */
function rdapBootstrap(fetchImpl: typeof fetch) {
  bootstrap ??= fetchImpl('https://data.iana.org/rdap/dns.json', { headers: { 'user-agent': USER_AGENT }, signal: AbortSignal.timeout(15000) })
    .then(async (r) => (r.ok ? ((await r.json()) as { services: [string[], string[]][] }).services : null))
    .catch(() => null);
  return bootstrap;
}

/** The registry's own RDAP base URL for a domain, or null when its TLD has no RDAP service. */
export async function rdapBase(domain: string, fetchImpl: typeof fetch = fetch): Promise<string | null | undefined> {
  const services = await rdapBootstrap(fetchImpl);
  if (!services) return undefined; // directory unreachable: caller falls back
  const tld = domain.split('.').at(-1)!;
  const hit = services.find(([tlds]) => tlds.includes(tld));
  const url = hit?.[1].find((u) => u.startsWith('https://')) ?? hit?.[1][0];
  return url ? url.replace(/\/?$/, '/') : null;
}

/** Domain registration expiry from RDAP (the successor to WHOIS), asked of the registry directly. Some country domains have no RDAP service. */
export async function domainExpiry(hostname: string, fetchImpl: typeof fetch = fetch): Promise<DomainInfo> {
  const domain = registrableDomain(hostname);
  if (domain.endsWith('.myshopify.com') || domain === 'myshopify.com') return { domain, expiresAt: null, registrar: 'Shopify' };
  try {
    const base = await rdapBase(domain, fetchImpl);
    if (base === null) return { domain, error: 'no RDAP service for this domain ending' };
    const res = await fetchImpl(`${base ?? 'https://rdap.org/'}domain/${domain}`, {
      headers: RDAP_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 404) return { domain, error: 'no RDAP data for this domain' };
    if (!res.ok) return { domain, error: `RDAP ${res.status}` };
    const json = (await res.json()) as { events?: RdapEvent[]; entities?: RdapEntity[] };
    const exp = json.events?.find((e) => e.eventAction === 'expiration')?.eventDate ?? null;
    const reg = json.entities?.find((e) => e.roles?.includes('registrar'));
    const fn = reg?.vcardArray?.[1]?.find((f) => f[0] === 'fn')?.[3] ?? null;
    return { domain, expiresAt: exp ? new Date(exp).toISOString() : null, registrar: typeof fn === 'string' ? fn : null };
  } catch (e) {
    return { domain, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Internal links from a page: same host, no cart/checkout/account/search, no query strings, deduped. */
export function internalLinks(html: string, pageUrl: string, limit = 25): string[] {
  const base = new URL(pageUrl);
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["']/gi)) {
    let u: URL;
    try {
      u = new URL(m[1].replace(/&amp;/g, '&'), base);
    } catch {
      continue;
    }
    if (u.host !== base.host || !/^https?:$/.test(u.protocol)) continue;
    if (/^\/(cart|checkout|checkouts|account|search|password|apps\/|cdn\/)/.test(u.pathname)) continue;
    if (u.pathname === '/' || u.pathname === base.pathname) continue;
    out.add(`${u.origin}${u.pathname.replace(/\/$/, '')}`);
    if (out.size >= limit) break;
  }
  return [...out];
}

export type BrokenLink = { url: string; status: number };

/** Visits the home page's internal links (politely) and returns the ones that fail. */
export async function findBrokenLinks(
  homeHtml: string,
  homeUrl: string,
  opts: { robots?: Robots; limit?: number; gapMs?: number; get?: typeof politeGet } = {},
): Promise<{ checked: number; broken: BrokenLink[] }> {
  const get = opts.get ?? politeGet;
  const links = internalLinks(homeHtml, homeUrl, opts.limit ?? 25).filter((u) => !opts.robots || isAllowed(opts.robots, new URL(u).pathname));
  const clock: HostClock = { last: 0 };
  const broken: BrokenLink[] = [];
  let checked = 0;
  for (const url of links) {
    const res = await get(url, { clock, gapMs: opts.gapMs ?? 1000, timeoutMs: 15000 });
    if (res.blocked) break; // a bot check: stop instead of hammering the store
    checked++;
    if (res.status === 404 || res.status === 410 || res.status >= 500) broken.push({ url, status: res.status });
  }
  return { checked, broken };
}

export const daysUntil = (iso: string | null | undefined, now = Date.now()) =>
  iso ? Math.floor((Date.parse(iso) - now) / 864e5) : null;

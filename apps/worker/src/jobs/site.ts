// Daily: SSL certificate and domain expiry, and broken links from the home page.

import { checkCertificate, daysUntil, domainExpiry, findBrokenLinks, parseRobots, politeGet, type Robots } from '@storecare/storefront';
import type { Db, StoreRow } from '../db.ts';

export type SiteResult = {
  sslExpiresAt: string | null;
  sslIssuer: string | null;
  sslError: string | null;
  domain: string;
  domainExpiresAt: string | null;
  domainError: string | null;
  pagesChecked: number;
  broken: { url: string; status: number }[];
};

export type SiteDeps = {
  cert: typeof checkCertificate;
  domain: typeof domainExpiry;
  get: typeof politeGet;
};

const defaultDeps: SiteDeps = { cert: checkCertificate, domain: domainExpiry, get: politeGet };

/** Alert on these days before expiry (once each, since the job runs daily). */
export const EXPIRY_ALERT_DAYS = [30, 14, 7, 3, 1, 0];

export async function runSite(db: Db, store: StoreRow, deps: SiteDeps = defaultDeps): Promise<SiteResult> {
  const host = new URL(store.public_url).hostname;
  const [cert, dom] = await Promise.all([deps.cert(host), deps.domain(host)]);

  let pagesChecked = 0;
  let broken: SiteResult['broken'] = [];
  const robotsRes = await deps.get(`${store.public_url}/robots.txt`, { accept: 'text/plain' });
  const robots: Robots = robotsRes.ok ? parseRobots(robotsRes.body) : { rules: [] };
  const home = await deps.get(`${store.public_url}/`);
  if (home.ok && !home.blocked) {
    const r = await findBrokenLinks(home.body, home.url || `${store.public_url}/`, { robots, get: deps.get });
    pagesChecked = r.checked;
    broken = r.broken;
  }

  const result: SiteResult = {
    sslExpiresAt: 'expiresAt' in cert ? cert.expiresAt : null,
    sslIssuer: 'expiresAt' in cert ? cert.issuer : null,
    sslError: 'error' in cert ? cert.error : null,
    domain: dom.domain,
    domainExpiresAt: 'expiresAt' in dom ? dom.expiresAt : null,
    domainError: 'error' in dom ? dom.error : null,
    pagesChecked,
    broken,
  };

  await db.query(
    `insert into public.site_checks
       (store_id, agency_id, checked_at, ssl_expires_at, ssl_issuer, ssl_error, domain, domain_expires_at, domain_error, pages_checked, broken)
     values ($1, $2, now(), $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      store.id, store.agency_id, result.sslExpiresAt, result.sslIssuer, result.sslError,
      result.domain, result.domainExpiresAt, result.domainError, result.pagesChecked, JSON.stringify(result.broken),
    ],
  );
  return result;
}

/** Which expiry warnings are due today. */
export function expiryAlerts(r: Pick<SiteResult, 'sslExpiresAt' | 'domainExpiresAt' | 'domain'>, now = Date.now()) {
  const out: { title: string; body: string }[] = [];
  const ssl = daysUntil(r.sslExpiresAt, now);
  if (ssl !== null && EXPIRY_ALERT_DAYS.includes(ssl)) {
    out.push({
      title: ssl === 0 ? 'SSL certificate expires today' : `SSL certificate expires in ${ssl} day${ssl === 1 ? '' : 's'}`,
      body: 'Shopify renews certificates automatically for domains pointed at it. If this one is not renewing, check the domain settings in Shopify.',
    });
  }
  const dom = daysUntil(r.domainExpiresAt, now);
  if (dom !== null && EXPIRY_ALERT_DAYS.includes(dom)) {
    out.push({
      title: dom === 0 ? `Domain ${r.domain} expires today` : `Domain ${r.domain} expires in ${dom} day${dom === 1 ? '' : 's'}`,
      body: 'Renew it with the registrar, or check that auto-renew and the payment card are up to date. An expired domain takes the store offline.',
    });
  }
  return out;
}

export const APP_ORIGIN = 'https://app.storecarehq.com';
export const WEBSITE_ORIGIN = 'https://www.storecarehq.com';
/** The landing page's link-preview image, served from the website host like the page itself. */
export const SHARE_IMAGE_PATH = '/welcome/opengraph-image';
/** Public pages served on the website host (and readable without an account on the app host). */
export const WEBSITE_PAGES = ['/privacy', '/terms', '/dpa', '/bot'];
/** Read by an external uptime monitor; answers without a session on any host. */
export const MONITORING_HEALTH_PATH = '/api/health/monitoring';

export function isWebsiteHost(host: string) {
  return host === 'www.storecarehq.com' || host === 'storecarehq.com';
}

export function isProductionHost(host: string) {
  return isWebsiteHost(host) || host === 'app.storecarehq.com' || host === 'storecarehq.vercel.app';
}

export function appLink(host: string, path: string) {
  return isProductionHost(host) ? `${APP_ORIGIN}${path}` : path;
}

export function websiteLink(host: string) {
  return isProductionHost(host) ? WEBSITE_ORIGIN : '/welcome';
}

const matches = (path: string, root: string) => path === root || path.startsWith(`${root}/`);
export const isOutreachReportPath = (path: string) => /^\/outreach\/r\/[^/]+(?:\/download)?\/?$/.test(path);
/** Search-engine files: served on every host (each host answers for itself) without a session. */
const CRAWLER_FILES = ['/robots.txt', '/sitemap.xml'];
export function isPublicPath(path: string) {
  return CRAWLER_FILES.includes(path) || isOutreachReportPath(path) || ['/login', '/auth', '/r', '/welcome'].some(root => matches(path, root)) || WEBSITE_PAGES.includes(path) || path === '/api/stripe/webhook' || path === '/api/contact' || path === '/api/scan' || path === MONITORING_HEALTH_PATH;
}

type Routing = { kind: 'redirect' | 'rewrite'; url: string } | { kind: 'reject' } | null;
function destination(origin: string, path: string, search: string) {
  const url = new URL(origin);
  url.pathname = path;
  url.search = search;
  return url.toString();
}

/** Decide host boundaries before reading any session. Never replay POST bodies across hosts. */
export function hostRouting(host: string, path: string, search = '', method = 'GET'): Routing {
  const website = isWebsiteHost(host);
  if (website && (path === '/' || path === '/welcome' || path === SHARE_IMAGE_PATH || WEBSITE_PAGES.includes(path))) {
    if (method !== 'GET' && method !== 'HEAD') return { kind: 'reject' };
    return path === '/' ? { kind: 'rewrite', url: destination(WEBSITE_ORIGIN, '/welcome', search) } : null;
  }
  // Keep already-shared reports, signed Stripe deliveries and in-flight recovery links working.
  // robots.txt and sitemap.xml answer for the host they were asked on.
  if (CRAWLER_FILES.includes(path) || isOutreachReportPath(path) || path === '/api/contact' || path === '/api/scan' || path === '/api/stripe/webhook' || path === MONITORING_HEALTH_PATH || matches(path, '/r') || path === '/auth/callback' || path === '/auth/password') return null;
  if (website || host === 'storecarehq.vercel.app') {
    if (method !== 'GET' && method !== 'HEAD') return { kind: 'reject' };
    return { kind: 'redirect', url: destination(APP_ORIGIN, path, search) };
  }
  if (host === 'app.storecarehq.com' && path === '/welcome') {
    return method === 'GET' || method === 'HEAD'
      ? { kind: 'redirect', url: destination(WEBSITE_ORIGIN, '/', search) } : { kind: 'reject' };
  }
  return null;
}

export function signedOutHome(host: string) {
  return host === 'app.storecarehq.com' ? '/login' : '/welcome';
}

export function sessionRouting(host: string, path: string, authenticated: boolean) {
  if (authenticated) return null;
  if (path === '/') return { kind: host === 'app.storecarehq.com' ? 'redirect' as const : 'rewrite' as const, path: signedOutHome(host) };
  return isPublicPath(path) ? null : { kind: 'redirect' as const, path: '/login' };
}

/** Only configured local/preview origins or our exact production hosts may receive auth codes. */
export function authCallbackUrl(host: string, configuredOrigin: string, previewHost?: string) {
  if (isProductionHost(host)) return `${APP_ORIGIN}/auth/callback`;
  const configured = new URL(configuredOrigin);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(configured.hostname);
  if (loopback && configured.host === host) return new URL('/auth/callback', configured).toString();
  if (previewHost && host === previewHost && host.endsWith('.vercel.app')) return `https://${host}/auth/callback`;
  throw new Error('Authentication is not configured for this address. Open StoreCare from its app address.');
}

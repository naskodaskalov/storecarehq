// What search engines may crawl and index. Only the public website (www.storecarehq.com) is for search;
// the app, client report links and preview deployments are kept out of results.

import { isOutreachReportPath, isWebsiteHost, WEBSITE_ORIGIN, WEBSITE_PAGES } from './domains.ts';

/** Served per host and never redirected between hosts. */
export const SEO_FILES = ['/robots.txt', '/sitemap.xml'];

/** Pages listed in the sitemap, in priority order. "/" is the landing page. */
export const SITEMAP_PAGES = ['/', ...WEBSITE_PAGES];

/** True when a response must carry "noindex": anything off the website host, and private report links everywhere. */
export function shouldNoindex(host: string, path: string): boolean {
  if (path.startsWith('/r/') || isOutreachReportPath(path)) return true;
  return !isWebsiteHost(host);
}

export function robotsTxt(host: string): string {
  if (!isWebsiteHost(host)) return 'User-agent: *\nDisallow: /\n';
  return ['User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /r/', 'Disallow: /outreach/', '', `Sitemap: ${WEBSITE_ORIGIN}/sitemap.xml`, ''].join('\n');
}

export function sitemapXml(pages: string[] = SITEMAP_PAGES): string {
  const urls = pages.map((p) => `  <url><loc>${WEBSITE_ORIGIN}${p === '/' ? '/' : p}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

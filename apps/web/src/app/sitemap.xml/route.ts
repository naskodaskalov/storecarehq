import { isWebsiteHost } from '@/lib/domains';
import { sitemapXml } from '@/lib/seo';

// The sitemap lists the public website only, so it is served only there.
export function GET(request: Request) {
  const host = request.headers.get('host') ?? new URL(request.url).host;
  if (!isWebsiteHost(host)) return new Response('Not found', { status: 404 });
  return new Response(sitemapXml(), { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}

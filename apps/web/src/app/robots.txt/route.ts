import { robotsTxt } from '@/lib/seo';

// Per host: the website invites crawlers, the app and previews turn them away.
export function GET(request: Request) {
  const host = request.headers.get('host') ?? new URL(request.url).host;
  return new Response(robotsTxt(host), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}

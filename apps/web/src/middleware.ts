import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { APP_ORIGIN, hostRouting, isPublicPath, isWebsiteHost, isOutreachReportPath, SHARE_IMAGE_PATH, sessionRouting, WEBSITE_PAGES, MONITORING_HEALTH_PATH } from './lib/domains';

// /r/<token> is the client's report link: no account, the token is the key. /welcome is the landing page.
// /api/stripe/webhook is called by Stripe and checks its own signature.

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? request.nextUrl.host;
  const path = request.nextUrl.pathname;
  if (isOutreachReportPath(path)) {
    const response = NextResponse.next();
    response.headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    response.headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  }
  const routing = hostRouting(host, path, request.nextUrl.search, request.method);
  if (routing?.kind === 'reject') return new NextResponse('This page has moved. Open https://app.storecarehq.com/login to continue.', { status: 409 });
  if (routing?.kind === 'redirect') return NextResponse.redirect(routing.url);
  if (routing?.kind === 'rewrite') {
    const url = request.nextUrl.clone();
    url.pathname = new URL(routing.url).pathname;
    return NextResponse.rewrite(url);
  }
  // The public website never needs to read or refresh an agency session.
  if ((isWebsiteHost(host) && (path === '/welcome' || path === SHARE_IMAGE_PATH || WEBSITE_PAGES.includes(path))) || path === '/api/contact' || path === '/api/scan' || path === MONITORING_HEALTH_PATH || path === '/api/stripe/webhook' || path.startsWith('/r/')) return NextResponse.next();
  // Layouts read the path (the app layout sends lapsed agencies to /billing from any other page).
  request.headers.set('x-pathname', request.nextUrl.pathname);
  if (process.env.STORECARE_DEMO === '1') {
    if (request.cookies.get('storecare-demo-signed-out')?.value === '1' && !isPublicPath(path)) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = '';
      return NextResponse.redirect(url);
    }
    return NextResponse.next({ request });
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Keep refreshed session cookies when middleware rewrites or redirects a request.
  const withSessionCookies = (next: NextResponse) => {
    for (const cookie of response.cookies.getAll()) next.cookies.set(cookie);
    return next;
  };

  const session = sessionRouting(host, path, !!user);
  if (session) {
    const url = host === 'app.storecarehq.com' ? new URL(APP_ORIGIN) : request.nextUrl.clone();
    url.pathname = session.path;
    url.search = request.nextUrl.search;
    return withSessionCookies(session.kind === 'redirect' ? NextResponse.redirect(url) : NextResponse.rewrite(url));
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico$|icon\\.svg$|apple-icon\\.png$).*)'],
};

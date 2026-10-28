import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// /r/<token> is the client's report link: no account, the token is the key. /welcome is the landing page.
// /api/stripe/webhook is called by Stripe and checks its own signature.
const PUBLIC = ['/login', '/auth', '/r/', '/welcome', '/api/stripe/webhook'];

export async function middleware(request: NextRequest) {
  // Layouts read the path (the app layout sends lapsed agencies to /billing from any other page).
  request.headers.set('x-pathname', request.nextUrl.pathname);
  if (process.env.STORECARE_DEMO === '1') return NextResponse.next({ request });
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

  const path = request.nextUrl.pathname;
  // Signed-out visitors to the home page see the landing page at the same address.
  if (!user && path === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/welcome';
    return NextResponse.rewrite(url);
  }
  if (!user && !PUBLIC.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

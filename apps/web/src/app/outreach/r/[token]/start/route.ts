import { NextResponse, type NextRequest } from 'next/server';
import { reportStore } from '@/lib/outreach-report-links';
import { SIGNUP_PATH, startSignup, type StartCookie } from '@/lib/outreach-start';

export const dynamic = 'force-dynamic';

/** "Check all your client stores": remember the client store (and the Black Friday offer), then open sign-up. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const host = request.headers.get('host') ?? request.nextUrl.host;
  let result: { location: string; cookies: StartCookie[] } = { location: SIGNUP_PATH, cookies: [] };
  try {
    result = await startSignup(token, await reportStore(), { host, secure: request.nextUrl.protocol === 'https:' });
  } catch (e) {
    // Report storage unavailable: sign-up still works, only without the prefilled store and the offer.
    console.error('[outreach start]', e instanceof Error ? e.message : e);
  }
  const response = NextResponse.redirect(new URL(result.location, request.url), 303);
  for (const { name, value, ...options } of result.cookies) response.cookies.set(name, value, options);
  return response;
}

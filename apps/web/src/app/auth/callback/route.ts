import { NextResponse, type NextRequest } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const passwordIntent = (await cookies()).get('storecare-password-intent')?.value === 'password';
  let success = false;
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    success = !error;
  }
  const destination = success ? (passwordIntent ? '/auth/password' : '/')
    : '/login?error=' + encodeURIComponent('This email link has expired or was already used. Request a new link and open it in the same browser.');
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.cookies.set('storecare-password-intent', '', { path: '/auth/callback', maxAge: 0 });
  return response;
}

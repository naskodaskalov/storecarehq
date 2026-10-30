'use server';

import { cookies } from 'next/headers';
import { headers } from 'next/headers';
import { authCallbackUrl } from '@/lib/domains';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import { isDemo } from '@/lib/demo';
import { loginWithPassword, registerWithPassword, requestRecovery, requestMagicLink, savePassword } from '@/lib/auth-flows';

const emailFrom = (f: FormData) => String(f.get('email') ?? '').trim();
const passwordFrom = (f: FormData) => String(f.get('password') ?? '');
const confirmationFrom = (f: FormData) => String(f.get('confirmation') ?? '');
const fail = (path: string, message: string) => redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
async function callbackUrl() {
  return authCallbackUrl((await headers()).get('host') ?? '', process.env.NEXT_PUBLIC_APP_URL!,
    process.env.VERCEL_ENV === 'preview' ? process.env.VERCEL_URL : undefined);
}
async function client(path: string) {
  if (isDemo()) fail(path, 'Account authentication is not configured in this preview.');
  return supabaseServer();
}
async function intent(password: boolean) {
  // Reuse the already-allowed callback URL for recovery; PKCE binds it to this browser.
  (await cookies()).set('storecare-password-intent', password ? 'password' : '', {
    httpOnly: true, sameSite: 'lax', secure: new URL(await callbackUrl()).protocol === 'https:',
    path: '/auth/callback', maxAge: password ? 3600 : 0,
  });
}
export async function signInPassword(form: FormData) {
  const supabase = await client('/login');
  const problem = await loginWithPassword(supabase.auth, emailFrom(form), passwordFrom(form));
  if (problem) fail('/login', problem);
  await intent(false);
  redirect('/');
}
export async function signUpPassword(form: FormData) {
  const path = '/login?trial=1';
  const supabase = await client(path);
  await intent(false);
  const problem = await registerWithPassword(supabase.auth, emailFrom(form), passwordFrom(form), confirmationFrom(form), await callbackUrl());
  if (problem) fail(path, problem);
  redirect('/login?verify=1');
}
export async function sendPasswordReset(form: FormData) {
  const path = '/auth/forgot-password';
  const supabase = await client(path);
  await intent(true);
  const problem = await requestRecovery(supabase.auth, emailFrom(form), await callbackUrl());
  if (problem) fail(path, problem);
  redirect('/auth/forgot-password?sent=1');
}
export async function sendSignInLink(form: FormData) {
  const path = '/login?method=link';
  const supabase = await client(path);
  await intent(false);
  const problem = await requestMagicLink(supabase.auth, emailFrom(form), await callbackUrl());
  if (problem) fail(path, problem);
  redirect('/login?method=link&sent=1');
}
export async function updatePassword(form: FormData) {
  const path = '/auth/password';
  const supabase = await client(path);
  const problem = await savePassword(supabase.auth, passwordFrom(form), confirmationFrom(form));
  if (problem) fail(path, problem);
  redirect('/auth/password?saved=1');
}

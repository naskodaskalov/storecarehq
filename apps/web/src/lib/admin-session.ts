// Server-only admin gate: reads the signed-in user from the Supabase session.

import { notFound, redirect } from 'next/navigation';
import { isAdminEmail } from './admin';
import { isDemo } from './demo';
import { supabaseServer } from './supabase';

/** Whether the signed-in user is an admin. Demo mode counts as admin so the page can be previewed locally. */
export async function currentUserIsAdmin(): Promise<boolean> {
  if (isDemo()) return true;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isAdminEmail(user?.email);
}

/** For admin pages and actions: signed-out users go to login, everyone else who is not an admin gets a 404. */
export async function requireAdmin(): Promise<{ email: string }> {
  if (isDemo()) return { email: 'demo@storecarehq.com' };
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  if (!isAdminEmail(user.email)) notFound();
  return { email: user.email! };
}

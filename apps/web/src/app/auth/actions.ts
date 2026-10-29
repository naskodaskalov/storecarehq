'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isDemo } from '@/lib/demo';
import { supabaseServer } from '@/lib/supabase';

export async function signOut() {
  if (isDemo()) {
    (await cookies()).set('storecare-demo-signed-out', '1', {
      httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/',
    });
  } else {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw new Error('Unable to sign out. Please try again.');
  }
  redirect('/login?signed_out=1');
}


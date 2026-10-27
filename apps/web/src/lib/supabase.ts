import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { demoClient, isDemo } from './demo';

/** Supabase client for server components, actions and route handlers. Runs as the signed-in user, so RLS applies. */
export async function supabaseServer() {
  // Demo mode returns an in-memory stand-in with the same query shape.
  if (isDemo()) return demoClient() as unknown as Awaited<ReturnType<typeof realClient>>;
  return realClient();
}

async function realClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a server component: the middleware refreshes the session instead.
        }
      },
    },
  });
}

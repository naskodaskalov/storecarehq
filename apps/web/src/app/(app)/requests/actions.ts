'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';

const STATUSES = ['new', 'in_progress', 'done'] as const;

/** Moves a client request along. RLS limits it to the agency's own requests; the client sees the new status in their portal. */
export async function setRequestStatus(formData: FormData) {
  const id = String(formData.get('request') ?? '');
  const status = String(formData.get('status') ?? '') as (typeof STATUSES)[number];
  const view = String(formData.get('view') ?? 'open');
  if (!id || !STATUSES.includes(status)) redirect('/requests');
  const supabase = await supabaseServer();
  const { error } = await supabase.from('requests').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  revalidatePath('/requests');
  revalidatePath('/', 'layout');
  redirect(`/requests?view=${encodeURIComponent(view)}${error ? '&error=1' : `&saved=${status}`}`);
}

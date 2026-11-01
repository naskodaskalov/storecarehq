'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireAgency } from '@/lib/data';
import { supabaseServer } from '@/lib/supabase';
import { validateAgencyProfile } from '@/lib/agency-profile';

const back = (q: string) => redirect(`/settings?${q}`);

export async function saveAgency(formData: FormData) {
  const { agency } = await requireAgency();
  const str = (k: string) => String(formData.get(k) ?? '').trim();

  const result = validateAgencyProfile({
    name: str('name'),
    brandColor: str('brand_color'),
    logoUrl: str('logo_url'),
    senderEmail: str('sender_email'),
    band: str('band'),
  });
  if (!result.ok) back('error=' + encodeURIComponent(result.error));
  const p = result.ok ? result.profile : null!;

  const supabase = await supabaseServer();
  // RLS lets only workspace owners update the agency; an update that matches no row means not allowed.
  const { data, error } = await supabase
    .from('agencies')
    .update({ name: p.name, brand_color: p.brandColor, logo_url: p.logoUrl, sender_email: p.senderEmail, stores_band: p.band })
    .eq('id', agency.id)
    .select('id');
  if (error) back('error=' + encodeURIComponent('Could not save your agency details. Please try again.'));
  if (!data?.length) back('error=' + encodeURIComponent('Only the workspace owner can change agency details.'));

  revalidatePath('/', 'layout');
  back('saved=1');
}

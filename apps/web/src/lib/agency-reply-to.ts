// Client replies to report emails go to the agency's reply-to address. Until the owner sets one in Settings,
// that is the email the agency was registered with (the owner's sign-in email).

import { supabaseAdmin } from './supabase-admin';

export async function ownerEmail(agencyId: string): Promise<string | null> {
  try {
    const admin = supabaseAdmin();
    const { data: owner } = await admin.from('memberships').select('user_id').eq('agency_id', agencyId).eq('role', 'owner')
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (!owner) return null;
    const { data } = await admin.auth.admin.getUserById(owner.user_id);
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}

export async function replyToFor(agencyId: string, senderEmail: string | null | undefined): Promise<string | null> {
  return senderEmail?.trim() || (await ownerEmail(agencyId));
}

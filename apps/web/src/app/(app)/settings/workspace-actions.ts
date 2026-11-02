'use server';

import { redirect } from 'next/navigation';
import { requireAgency } from '@/lib/data';
import { isDemo } from '@/lib/demo';
import { stripe, stripeEnabled } from '@/lib/stripe';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { supabaseServer } from '@/lib/supabase';
import { alreadyGone, deleteWorkspace } from '@/lib/workspace-data';

const back = (error: string) => redirect(`/settings?error=${encodeURIComponent(error)}#your-data`);

/** Owner only: cancel billing, delete the agency (everything cascades) and, if this was their only workspace,
 *  the sign-in account. Asks for the agency name typed out in full. */
export async function deleteWorkspaceAction(formData: FormData) {
  if (isDemo()) back('Connect a real workspace to delete it.');
  const { agency, userId } = await requireAgency();
  const supabase = await supabaseServer();
  const { data: membership } = await supabase.from('memberships').select('role').eq('agency_id', agency.id).eq('user_id', userId).single();
  const admin = supabaseAdmin();

  const result = await deleteWorkspace(
    {
      cancelSubscription: async (id) => {
        if (!stripeEnabled()) return;
        try {
          await stripe().subscriptions.cancel(id);
        } catch (e) {
          if (!alreadyGone(e)) throw e;
        }
      },
      deleteAgency: async (id) => {
        const { error } = await admin.from('agencies').delete().eq('id', id);
        if (error) throw error;
      },
      otherMemberships: async (uid) => {
        const { count, error } = await admin.from('memberships').select('agency_id', { count: 'exact', head: true }).eq('user_id', uid);
        if (error) throw error;
        return count ?? 0;
      },
      deleteUser: async (uid) => {
        const { error } = await admin.auth.admin.deleteUser(uid);
        if (error) throw error;
      },
    },
    {
      agencyId: agency.id,
      agencyName: agency.name,
      subscriptionId: agency.stripe_subscription_id ?? null,
      userId,
      isOwner: membership?.role === 'owner',
      confirm: String(formData.get('confirm') ?? ''),
    },
  );
  if (!result.ok) back(result.error);
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    /* the account may already be gone; the cookies are cleared either way */
  }
  redirect(`/login?deleted=${result.ok && result.accountDeleted ? 'account' : 'workspace'}`);
}

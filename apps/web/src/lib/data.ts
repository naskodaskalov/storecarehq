import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase';

import type { BillingFields } from './billing';

export type Agency = { id: string; name: string; plan: string; brand_color: string } & BillingFields;
const AGENCY_COLUMNS =
  'id, name, plan, brand_color, trial_ends_at, subscription_status, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id';

/** The signed-in user's agency, or a redirect to onboarding. */
export async function requireAgency(): Promise<{ agency: Agency; userId: string }> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data } = await supabase.from('agencies').select(AGENCY_COLUMNS).order('created_at').limit(1);
  if (!data?.length) redirect('/onboarding');
  return { agency: data[0] as Agency, userId: user.id };
}

export type StoreSummary = {
  id: string;
  name: string;
  public_url: string;
  status: 'active' | 'limited' | 'paused';
  limited_reason: string | null;
  health_score: number | null;
  timezone: string | null;
  care_plans: { hours_included: number } | null;
};

export function monthStart(d = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export async function dashboard(agencyId: string) {
  const supabase = await supabaseServer();
  const since7 = new Date(Date.now() - 7 * 864e5).toISOString();
  const [stores, incidents, changes, work, checkouts, reports] = await Promise.all([
    supabase
      .from('stores')
      .select('id, name, public_url, status, limited_reason, health_score, timezone, care_plans(hours_included)')
      .eq('agency_id', agencyId)
      .order('name'),
    supabase.from('incidents').select('id, store_id, kind, cause, opened_at').eq('agency_id', agencyId).is('resolved_at', null),
    supabase
      .from('changes')
      .select('id, store_id, summary, risky, work_entry_id, occurred_at')
      .eq('agency_id', agencyId)
      .gte('occurred_at', since7)
      .order('occurred_at', { ascending: false }),
    supabase.from('work_entries').select('store_id, minutes, counts_to_plan').eq('agency_id', agencyId).gte('work_date', monthStart()),
    supabase
      .from('checkout_runs')
      .select('store_id, result, ran_at, device')
      .eq('agency_id', agencyId)
      .gte('ran_at', new Date(Date.now() - 864e5).toISOString())
      .order('ran_at', { ascending: false }),
    supabase.from('reports').select('id, store_id, period, status').eq('agency_id', agencyId).order('period', { ascending: false }),
  ]);
  return {
    stores: (stores.data ?? []) as unknown as StoreSummary[],
    incidents: incidents.data ?? [],
    changes: changes.data ?? [],
    work: work.data ?? [],
    checkouts: checkouts.data ?? [],
    reports: reports.data ?? [],
  };
}

/** The rows behind the Overview's activity log: two weeks of changes and incidents across every store. */
export async function activity(agencyId: string) {
  const supabase = await supabaseServer();
  const since = new Date(Date.now() - 14 * 864e5).toISOString();
  const cols = 'id, store_id, kind, opened_at, resolved_at, cause';
  const [changes, opened, resolved] = await Promise.all([
    supabase.from('changes').select('id, store_id, occurred_at, summary, risky, work_entry_id').eq('agency_id', agencyId).gte('occurred_at', since).order('occurred_at', { ascending: false }).limit(60),
    supabase.from('incidents').select(cols).eq('agency_id', agencyId).gte('opened_at', since).order('opened_at', { ascending: false }).limit(30),
    supabase.from('incidents').select(cols).eq('agency_id', agencyId).gte('resolved_at', since).order('resolved_at', { ascending: false }).limit(30),
  ]);
  const incidents = new Map([...(opened.data ?? []), ...(resolved.data ?? [])].map((i) => [i.id, i]));
  return {
    changes: changes.data ?? [],
    incidents: [...incidents.values()],
    error: !!(changes.error || opened.error || resolved.error),
  };
}

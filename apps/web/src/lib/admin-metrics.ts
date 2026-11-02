// Numbers for the admin overview (/admin), read in one call from public.admin_metrics() (service role only).
import { PLANS, isPlanKey } from './billing.ts';
import { verdict, type Freshness } from './monitoring-health.ts';

export type Counts = { today: number; week: number; total: number };
export type RecentSignup = {
  email: string;
  created_at: string;
  confirmed: boolean;
  last_sign_in_at: string | null;
  workspace: string | null;
  plan: string | null;
  subscription_status: string | null;
  cancel_at_period_end: boolean | null;
  trial_ends_at: string | null;
  stores: number;
};
export type AdminMetrics = {
  timezone: string;
  generated_at: string;
  users: Counts & { unconfirmed: number };
  stores: Counts & { active: number; limited: number; paused: number };
  workspaces: Counts;
  outreach: Counts & { agencies: number };
  subscriptions: {
    trialing: number; active: number; past_due: number; cancelling: number; ended: number; no_card: number;
    plans: { status: string; plan: string; cancelling: boolean; count: number }[];
  };
  funnel: { signed_up: number; confirmed: number; workspace: number; store: number; trial: number; paying: number };
  recent_signups: RecentSignup[];
  activity: { reports_sent_week: number; work_entries_week: number; open_incidents: number };
  monitoring: Freshness;
};

/** Monthly revenue at list prices (no coupons or tax): what live paid plans bill, and what open trials bill if they convert. */
export function revenue(s: AdminMetrics['subscriptions']) {
  const price = (plan: string) => (isPlanKey(plan) ? PLANS[plan].usd : 0);
  let mrr = 0, pipeline = 0;
  for (const p of s.plans) {
    if (p.status === 'active' || p.status === 'past_due') mrr += price(p.plan) * p.count;
    else if (p.status === 'trialing' && !p.cancelling) pipeline += price(p.plan) * p.count;
  }
  return { mrr, pipeline, paying: s.active + s.past_due, converting: s.plans.filter((p) => p.status === 'trialing' && !p.cancelling).reduce((n, p) => n + p.count, 0) };
}

export const FUNNEL = [
  ['signed_up', 'Signed up', 'Created an account'],
  ['confirmed', 'Confirmed email', 'Clicked the sign-up email'],
  ['workspace', 'Created a workspace', 'Named their agency'],
  ['store', 'Added a store', 'At least one client store'],
  ['trial', 'Started a trial', 'Card added at checkout'],
  ['paying', 'Paying', 'Subscription active'],
] as const;

/** Each onboarding step with its share of all sign-ups and its conversion from the step before. */
export function funnelSteps(f: AdminMetrics['funnel']) {
  return FUNNEL.map(([key, label, detail], i) => {
    const count = f[key], before = i === 0 ? count : f[FUNNEL[i - 1][0]];
    return { key, label, detail, count, share: f.signed_up ? count / f.signed_up : 0, fromPrevious: before ? count / before : 0 };
  });
}

/** How a recent sign-up stands, as a label and a status tone (tones match .success/.warning/.danger/.neutral). */
export function signupStatus(s: RecentSignup, timeZone: string): { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' } {
  const plan = s.plan && isPlanKey(s.plan) ? PLANS[s.plan].name : null;
  if (!s.confirmed) return { label: 'Email not confirmed', tone: 'warning' };
  if (!s.workspace) return { label: 'No workspace yet', tone: 'neutral' };
  switch (s.subscription_status) {
    case 'active': return s.cancel_at_period_end ? { label: `${plan ?? 'Plan'} · cancelling`, tone: 'warning' } : { label: `${plan ?? 'Plan'} · paying`, tone: 'success' };
    case 'past_due': return { label: `${plan ?? 'Plan'} · past due`, tone: 'danger' };
    case 'trialing': {
      if (s.cancel_at_period_end) return { label: `${plan ?? 'Trial'} trial · cancelling`, tone: 'warning' };
      const ends = s.trial_ends_at ? new Date(s.trial_ends_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone }) : null;
      return { label: `${plan ?? 'Plan'} trial${ends ? ` · ends ${ends}` : ''}`, tone: 'neutral' };
    }
    case null: case undefined: return { label: s.stores ? 'No card yet' : 'No store yet', tone: 'neutral' };
    default: return { label: 'Subscription ended', tone: 'neutral' };
  }
}

export function monitoringStatus(m: Freshness): { ok: boolean; text: string } {
  const v = verdict(m);
  if (!v.ok) return { ok: false, text: v.problem! };
  if (m.last_check_minutes === null) return { ok: true, text: 'No checks yet' };
  return { ok: true, text: `Last check ${m.last_check_minutes < 1 ? 'just now' : `${minutes(m.last_check_minutes)} ago`}` };
}

const minutes = (n: number) => (n < 60 ? `${n} min` : n < 48 * 60 ? `${Math.round(n / 60)} h` : `${Math.round(n / 1440)} days`);

/** "just now", "12 min ago", "5 h ago", "3 days ago", then a date. */
export function ago(iso: string, now: string, timeZone: string): string {
  const mins = Math.floor((Date.parse(now) - Date.parse(iso)) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 14 * 1440) return `${minutes(mins)} ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone });
}

/** Whole numbers as people read them: 1,284 and 12.9K from ten thousand up. */
export const figure = (n: number) => (n >= 10_000 ? new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : n.toLocaleString('en-US'));
export const usd = (n: number) => `$${figure(n)}`;
export const percent = (x: number) => `${Math.round(x * 100)}%`;

/** Sample numbers for demo mode (no database), so the page can be reviewed locally. */
export function demoMetrics(timeZone: string, now = new Date()): AdminMetrics {
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 36e5).toISOString();
  const signup = (email: string, hoursAgo: number, over: Partial<RecentSignup>): RecentSignup => ({
    email, created_at: at(hoursAgo), confirmed: true, last_sign_in_at: at(Math.max(0, hoursAgo - 1)), workspace: null, plan: null,
    subscription_status: null, cancel_at_period_end: false, trial_ends_at: null, stores: 0, ...over,
  });
  return {
    timezone: timeZone,
    generated_at: now.toISOString(),
    users: { today: 2, week: 9, total: 41, unconfirmed: 3 },
    stores: { today: 5, week: 23, total: 118, active: 104, limited: 9, paused: 5 },
    workspaces: { today: 1, week: 6, total: 33 },
    outreach: { today: 4, week: 18, total: 57, agencies: 52 },
    subscriptions: {
      trialing: 5, active: 11, past_due: 1, cancelling: 2, ended: 3, no_card: 13,
      plans: [
        { status: 'active', plan: 'agency', cancelling: false, count: 4 },
        { status: 'active', plan: 'pro', cancelling: false, count: 1 },
        { status: 'active', plan: 'solo', cancelling: false, count: 5 },
        { status: 'active', plan: 'solo', cancelling: true, count: 1 },
        { status: 'past_due', plan: 'solo', cancelling: false, count: 1 },
        { status: 'trialing', plan: 'agency', cancelling: false, count: 2 },
        { status: 'trialing', plan: 'solo', cancelling: false, count: 2 },
        { status: 'trialing', plan: 'solo', cancelling: true, count: 1 },
      ],
    },
    funnel: { signed_up: 41, confirmed: 38, workspace: 33, store: 26, trial: 19, paying: 12 },
    recent_signups: [
      signup('maya@juniperandash.example', 3, { workspace: 'Juniper Studio', plan: 'agency', subscription_status: 'trialing', trial_ends_at: at(-160), stores: 4 }),
      signup('dev@ferrolabs.example', 9, { confirmed: false, last_sign_in_at: null }),
      signup('hello@kiteandkin.example', 30, { workspace: 'Kite & Kin', stores: 1 }),
      signup('ops@saltgrass.example', 52, { workspace: 'Saltgrass Digital', plan: 'solo', subscription_status: 'active', stores: 3 }),
      signup('liv@harper.example', 75, { workspace: 'Harper & Co', plan: 'solo', subscription_status: 'trialing', cancel_at_period_end: true, trial_ends_at: at(-40), stores: 2 }),
      signup('sam@copperline.example', 140, { workspace: 'Copperline', plan: 'pro', subscription_status: 'past_due', stores: 12 }),
    ],
    activity: { reports_sent_week: 14, work_entries_week: 63, open_incidents: 1 },
    monitoring: { eligible: 109, stale: 0, last_check_minutes: 6, waiting_health_checks: 0 },
  };
}

/** The overview numbers, or why they are missing. */
export async function loadAdminMetrics(timeZone: string): Promise<{ metrics: AdminMetrics; error: null } | { metrics: null; error: string }> {
  if (process.env.STORECARE_DEMO === '1') return { metrics: demoMetrics(timeZone), error: null };
  try {
    const { supabaseAdmin } = await import('./supabase-admin.ts');
    const { data, error } = await supabaseAdmin().rpc('admin_metrics', { p_tz: timeZone });
    if (error || !data) throw new Error(error?.message);
    return { metrics: data as AdminMetrics, error: null };
  } catch {
    return { metrics: null, error: 'The numbers could not be loaded. Apply the admin-metrics migration and set SUPABASE_SERVICE_ROLE_KEY.' };
  }
}

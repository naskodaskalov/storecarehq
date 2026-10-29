// Plans, trial and access, shared by the billing page, the app layout and the Stripe webhook.
// No imports, so `node --test` can run its tests directly. Store limits mirror public.plan_store_limit().

export const PLANS = {
  solo: { name: 'Solo', usd: 29, stores: 5 },
  agency: { name: 'Agency', usd: 79, stores: 20 },
  pro: { name: 'Pro', usd: 149, stores: 50 },
} as const;
export type PlanKey = keyof typeof PLANS;
export const PLAN_KEYS = Object.keys(PLANS) as PlanKey[];
export const isPlanKey = (k: unknown): k is PlanKey => typeof k === 'string' && k in PLANS;

export const TRIAL_DAYS = 7;
export const TRIAL_STORE_LIMIT = 20;

/** Stripe price lookup key, so prices are found (or created once) by name rather than pasted IDs. */
export const lookupKey = (p: PlanKey) => `storecare_${p}_monthly`;
export function planFromLookupKey(key: string | null | undefined): PlanKey | null {
  const m = key?.match(/^storecare_(\w+)_monthly$/);
  return m && isPlanKey(m[1]) ? m[1] : null;
}

export type BillingFields = {
  plan: string;
  trial_ends_at: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
};

const PAYING = ['active', 'trialing', 'past_due'];

export type BillingState = {
  paying: boolean; // has a live Stripe subscription, including its free trial
  plan: PlanKey | null; // the chosen plan, when paying
  onTrial: boolean; // Stripe trial (card on file) or an older card-free trial
  cardOnFile: boolean; // the trial is Stripe's: the first payment happens by itself when it ends
  trialEndsAt: string | null;
  trialDaysLeft: number; // whole days, rounded up; 0 when ended
  hasAccess: boolean;
  storeLimit: number;
  pastDue: boolean;
  endsAt: string | null; // a cancelled plan's last day
};

/** Same rule as public.agency_has_access(). */
export function billingState(a: BillingFields, now = new Date()): BillingState {
  const paying = PAYING.includes(a.subscription_status ?? '');
  const plan = paying && isPlanKey(a.plan) ? a.plan : null;
  const stripeTrial = a.subscription_status === 'trialing';
  const trialEndsAt = stripeTrial ? a.current_period_end : !paying ? a.trial_ends_at : null;
  const trialMs = trialEndsAt ? Date.parse(trialEndsAt) - now.getTime() : -1;
  const onTrial = trialMs > 0 && (stripeTrial || !paying);
  return {
    paying,
    plan,
    onTrial,
    cardOnFile: stripeTrial,
    trialEndsAt: onTrial ? trialEndsAt : null,
    trialDaysLeft: onTrial ? Math.ceil(trialMs / 864e5) : 0,
    hasAccess: paying || (a.trial_ends_at ? Date.parse(a.trial_ends_at) > now.getTime() : false),
    storeLimit: plan ? PLANS[plan].stores : TRIAL_STORE_LIMIT,
    pastDue: a.subscription_status === 'past_due',
    endsAt: paying && a.cancel_at_period_end ? a.current_period_end : null,
  };
}

/** The parts of a Stripe subscription we read (works with the SDK type and with test fixtures). */
export type SubscriptionLike = {
  id: string;
  customer: string | { id: string };
  status: string;
  cancel_at_period_end: boolean;
  metadata?: Record<string, string> | null;
  items: { data: { price: { lookup_key: string | null }; current_period_end?: number | null }[] };
};

/** Agency columns to write for a subscription. A finished subscription puts the agency back on 'trial'
 *  (with its trial long over, that means no access until it subscribes again). */
export function agencyUpdateFromSubscription(sub: SubscriptionLike) {
  const item = sub.items.data[0];
  const plan = planFromLookupKey(item?.price.lookup_key);
  const live = PAYING.includes(sub.status);
  return {
    plan: live && plan ? plan : 'trial',
    subscription_status: sub.status,
    stripe_subscription_id: sub.id,
    stripe_customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    current_period_end: item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end,
  };
}

/** The free days Checkout gives: 7 on an agency's first subscription (card taken now, charged after),
 *  none for an agency that has subscribed before. Always 7, also for accounts from before card-first sign-up. */
export function checkoutTrial(a: Pick<BillingFields, 'stripe_subscription_id'> & Partial<BillingFields>): { trial_period_days: number } | Record<string, never> {
  return a.stripe_subscription_id ? {} : { trial_period_days: TRIAL_DAYS };
}

export const formatUsd = (n: number) => `$${n}`;

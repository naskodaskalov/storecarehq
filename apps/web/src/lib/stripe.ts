// Stripe on the server: client, prices by lookup key, customer portal, and writing a subscription
// to its agency. Needs STRIPE_SECRET_KEY; the webhook also needs STRIPE_WEBHOOK_SECRET.

import Stripe from 'stripe';
import { agencyUpdateFromSubscription, lookupKey, PLANS, type PlanKey } from './billing';
import { supabaseAdmin } from './supabase-admin';

let client: Stripe | null = null;
export const stripeEnabled = () => !!process.env.STRIPE_SECRET_KEY;
export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set');
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY, { appInfo: { name: 'StoreCare HQ' } });
  return client;
}

/** The monthly price for a plan, created in Stripe the first time it is needed (test and live mode each get their own). */
export async function priceFor(plan: PlanKey): Promise<string> {
  const key = lookupKey(plan);
  const found = await stripe().prices.list({ lookup_keys: [key], active: true, limit: 1 });
  if (found.data[0]) return found.data[0].id;
  const p = PLANS[plan];
  const price = await stripe().prices.create({
    currency: 'usd',
    unit_amount: p.usd * 100,
    recurring: { interval: 'month' },
    lookup_key: key,
    transfer_lookup_key: true,
    product_data: { name: `StoreCare HQ ${p.name}`, metadata: { plan } },
    metadata: { plan },
  });
  return price.id;
}

/** A customer portal setup for updating the card, seeing invoices and cancelling (plan changes happen in the app). */
export async function portalConfiguration(): Promise<string> {
  const list = await stripe().billingPortal.configurations.list({ active: true, limit: 10 });
  const ours = list.data.find((c) => c.metadata?.app === 'storecarehq');
  if (ours) return ours.id;
  const created = await stripe().billingPortal.configurations.create({
    business_profile: { headline: 'StoreCare HQ billing' },
    features: {
      customer_update: { enabled: true, allowed_updates: ['email', 'address', 'name', 'tax_id'] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: 'at_period_end' },
    },
    metadata: { app: 'storecarehq' },
  });
  return created.id;
}

/** Re-reads the subscription from Stripe (so event order never matters) and writes it to its agency. */
export async function syncSubscription(subscriptionId: string, agencyIdHint?: string | null): Promise<string | null> {
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const update = agencyUpdateFromSubscription(sub);
  const admin = supabaseAdmin();
  let agencyId = sub.metadata?.agency_id || agencyIdHint || null;
  if (!agencyId) {
    const { data } = await admin.from('agencies').select('id').eq('stripe_customer_id', update.stripe_customer_id).maybeSingle();
    agencyId = data?.id ?? null;
  }
  if (!agencyId) {
    console.warn(`[billing] subscription ${sub.id} has no agency`);
    return null;
  }
  const { data: agency } = await admin.from('agencies').select('stripe_subscription_id').eq('id', agencyId).single();
  // A newer subscription replaces an old one, but events for an old, finished one must not overwrite it.
  if (agency?.stripe_subscription_id && agency.stripe_subscription_id !== sub.id && !['active', 'trialing', 'past_due'].includes(sub.status)) {
    return agencyId;
  }
  const { error } = await admin.from('agencies').update(update).eq('id', agencyId);
  if (error) throw new Error(`[billing] could not update agency ${agencyId}: ${error.message}`);
  return agencyId;
}

/** Back from Checkout: apply the new subscription now instead of waiting for the webhook. */
export async function confirmCheckout(sessionId: string, agencyId: string): Promise<boolean> {
  if (!stripeEnabled() || !/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return false;
  try {
    const s = await stripe().checkout.sessions.retrieve(sessionId);
    if (s.client_reference_id !== agencyId || !s.subscription) return false;
    await syncSubscription(typeof s.subscription === 'string' ? s.subscription : s.subscription.id, agencyId);
    return true;
  } catch (e) {
    console.error('[billing] confirm checkout failed', e);
    return false;
  }
}

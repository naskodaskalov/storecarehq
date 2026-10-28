'use server';

import { redirect } from 'next/navigation';
import Stripe from 'stripe';
import { billingState, checkoutTrial, isPlanKey, PLANS, type PlanKey } from '@/lib/billing';
import { requireAgency } from '@/lib/data';
import { supabaseServer } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { portalConfiguration, priceFor, stripe, stripeEnabled, syncSubscription } from '@/lib/stripe';

const APP = () => process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
/** Sign-up (onboarding) and the billing page share these actions; each returns to its own page. */
type Back = '/billing' | '/onboarding/trial';
const fail = (back: Back, msg: string): never => redirect(`${back}?error=${encodeURIComponent(msg)}`);

/** Stripe errors become a message on the page; redirects pass through. */
async function guarded(back: Back, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof Stripe.errors.StripeError) {
      console.error('[billing]', e.type, e.message);
      fail(back, `Stripe: ${e.message}`);
    }
    throw e;
  }
}

async function ownerAgency(back: Back) {
  const { agency, userId } = await requireAgency();
  const supabase = await supabaseServer();
  const { data: m } = await supabase.from('memberships').select('role').eq('agency_id', agency.id).eq('user_id', userId).single();
  if (m?.role !== 'owner') fail(back, 'Only the agency owner can change billing.');
  const { data: { user } } = await supabase.auth.getUser();
  const { count } = await supabase.from('stores').select('id', { count: 'exact', head: true }).eq('agency_id', agency.id);
  return { agency, email: user?.email ?? undefined, storeCount: count ?? 0 };
}

/** Starts a plan (Stripe Checkout: card now, 7 free days on the first plan) or switches a running one. */
export async function choosePlan(formData: FormData) {
  const back: Back = formData.get('from') === 'onboarding' ? '/onboarding/trial' : '/billing';
  if (!stripeEnabled()) fail(back, 'Billing is not connected yet.');
  const plan = formData.get('plan');
  if (!isPlanKey(plan)) fail(back, 'Pick a plan.');
  await guarded(back, () => choose(back, plan as PlanKey));
}

async function choose(back: Back, plan: PlanKey) {
  const p = PLANS[plan];
  const { agency, email, storeCount } = await ownerAgency(back);
  if (storeCount > p.stores) {
    fail(back, `The ${p.name} plan includes up to ${p.stores} stores and you have ${storeCount}. Remove or pause stores first, or pick a larger plan.`);
  }
  const state = billingState(agency);
  const price = await priceFor(plan);

  if (state.paying && agency.stripe_subscription_id) {
    const sub = await stripe().subscriptions.retrieve(agency.stripe_subscription_id);
    await stripe().subscriptions.update(sub.id, {
      items: [{ id: sub.items.data[0].id, price }],
      proration_behavior: 'create_prorations',
      cancel_at_period_end: false,
      metadata: { agency_id: agency.id },
    });
    await syncSubscription(sub.id, agency.id);
    redirect(`/billing?changed=${plan}`);
  }

  // One Stripe customer per agency, created on the first checkout.
  let customer = agency.stripe_customer_id;
  if (!customer) {
    const c = await stripe().customers.create({ email, name: agency.name, metadata: { agency_id: agency.id } });
    customer = c.id;
    const { error } = await supabaseAdmin().from('agencies').update({ stripe_customer_id: customer }).eq('id', agency.id);
    if (error) fail(back, `Could not save the billing customer: ${error.message}`);
  }
  const trial = checkoutTrial(agency);
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: agency.id,
    line_items: [{ price, quantity: 1 }],
    payment_method_collection: 'always', // a card even when the first 7 days are free
    subscription_data: {
      metadata: { agency_id: agency.id, plan },
      ...trial,
      // If the card is removed during the trial, the plan ends instead of renewing unpaid.
      ...(Object.keys(trial).length ? { trial_settings: { end_behavior: { missing_payment_method: 'cancel' as const } } } : {}),
    },
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    customer_update: { name: 'auto', address: 'auto' },
    tax_id_collection: { enabled: true },
    success_url: `${APP()}${back}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP()}${back}`,
  });
  redirect(session.url ?? fail(back, 'Stripe did not return a checkout page.'));
}

/** Stripe's customer portal: card, invoices, cancel. */
export async function openPortal() {
  if (!stripeEnabled()) fail('/billing', 'Billing is not connected yet.');
  await guarded('/billing', async () => {
    const { agency } = await ownerAgency('/billing');
    if (!agency.stripe_customer_id) fail('/billing', 'Choose a plan first.');
    const session = await stripe().billingPortal.sessions.create({
      customer: agency.stripe_customer_id!,
      configuration: await portalConfiguration(),
      return_url: `${APP()}/billing`,
    });
    redirect(session.url);
  });
}

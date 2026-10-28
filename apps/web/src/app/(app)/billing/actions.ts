'use server';

import { redirect } from 'next/navigation';
import { billingState, chargeFrom, isPlanKey, PLANS } from '@/lib/billing';
import { requireAgency } from '@/lib/data';
import { supabaseServer } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
import Stripe from 'stripe';
import { portalConfiguration, priceFor, stripe, stripeEnabled, syncSubscription } from '@/lib/stripe';

/** Stripe errors become a message on the billing page; redirects pass through. */
async function guarded(fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    if (e instanceof Stripe.errors.StripeError) {
      console.error('[billing]', e.type, e.message);
      fail(`Stripe: ${e.message}`);
    }
    throw e;
  }
}

const APP = () => process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const fail = (msg: string): never => redirect(`/billing?error=${encodeURIComponent(msg)}`);

async function ownerAgency() {
  const { agency, userId } = await requireAgency();
  const supabase = await supabaseServer();
  const { data: m } = await supabase.from('memberships').select('role').eq('agency_id', agency.id).eq('user_id', userId).single();
  if (m?.role !== 'owner') fail('Only the agency owner can change billing.');
  const { data: { user } } = await supabase.auth.getUser();
  const { count } = await supabase.from('stores').select('id', { count: 'exact', head: true }).eq('agency_id', agency.id);
  return { agency, email: user?.email ?? undefined, storeCount: count ?? 0 };
}

/** Subscribes (Stripe Checkout) or, with a subscription already running, switches its plan. */
export async function choosePlan(formData: FormData) {
  if (!stripeEnabled()) fail('Billing is not connected yet.');
  await guarded(() => choose(formData));
}

async function choose(formData: FormData) {
  const plan = formData.get('plan');
  if (!isPlanKey(plan)) fail('Pick a plan.');
  const p = PLANS[plan as keyof typeof PLANS];
  const { agency, email, storeCount } = await ownerAgency();
  if (storeCount > p.stores) {
    fail(`The ${p.name} plan includes up to ${p.stores} stores and you have ${storeCount}. Remove or pause stores first, or pick a larger plan.`);
  }
  const state = billingState(agency);
  const price = await priceFor(plan as keyof typeof PLANS);

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
    if (error) fail(`Could not save the billing customer: ${error.message}`);
  }
  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: agency.id,
    line_items: [{ price, quantity: 1 }],
    // Subscribing mid-trial: the remaining trial days stay free; Stripe charges when they end.
    subscription_data: { metadata: { agency_id: agency.id, plan: plan as string }, trial_end: chargeFrom(agency) ?? undefined },
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    customer_update: { name: 'auto', address: 'auto' },
    tax_id_collection: { enabled: true },
    success_url: `${APP()}/billing?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP()}/billing`,
  });
  redirect(session.url ?? fail('Stripe did not return a checkout page.'));
}

/** Stripe's customer portal: card, invoices, cancel. */
export async function openPortal() {
  if (!stripeEnabled()) fail('Billing is not connected yet.');
  await guarded(portal);
}

async function portal() {
  const { agency } = await ownerAgency();
  if (!agency.stripe_customer_id) fail('Choose a plan first.');
  const session = await stripe().billingPortal.sessions.create({
    customer: agency.stripe_customer_id!,
    configuration: await portalConfiguration(),
    return_url: `${APP()}/billing`,
  });
  redirect(session.url);
}

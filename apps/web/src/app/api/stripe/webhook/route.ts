// Stripe → agency plan. Verifies the signature, then re-reads the subscription from Stripe and writes it.
// Events to send (Stripe dashboard → Developers → Webhooks): checkout.session.completed,
// customer.subscription.created, customer.subscription.updated, customer.subscription.deleted.

import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { stripe, syncSubscription } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: 'billing not configured' }, { status: 503 });

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(body, request.headers.get('stripe-signature') ?? '', secret);
  } catch {
    return NextResponse.json({ error: 'bad signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object;
        if (s.mode === 'subscription' && s.subscription) {
          await syncSubscription(typeof s.subscription === 'string' ? s.subscription : s.subscription.id, s.client_reference_id);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(event.data.object.id);
        break;
    }
  } catch (e) {
    console.error('[billing] webhook failed', event.type, e);
    return NextResponse.json({ error: 'sync failed' }, { status: 500 }); // Stripe retries
  }
  return NextResponse.json({ received: true });
}

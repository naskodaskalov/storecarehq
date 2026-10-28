import { redirect } from 'next/navigation';
import { billingState, PLAN_KEYS, PLANS, TRIAL_DAYS, type PlanKey } from '@/lib/billing';
import { requireAgency } from '@/lib/data';
import { supabaseServer } from '@/lib/supabase';
import { confirmCheckout, stripeEnabled } from '@/lib/stripe';
import { SubmitButton } from '@/components/submit-button';
import { choosePlan } from '@/app/(app)/billing/actions';
import { OnboardingTop } from '../steps';

// From the onboarding answer "How many client stores do you look after?"
const SUGGEST: Record<string, PlanKey> = { '1–5': 'solo', '6–15': 'agency', '16–40': 'pro', '40+': 'pro' };

export default async function Trial({ searchParams }: { searchParams: Promise<{ session_id?: string; error?: string }> }) {
  const q = await searchParams;
  const { agency } = await requireAgency();
  if (q.session_id) {
    const done = await confirmCheckout(q.session_id, agency.id);
    redirect(done ? '/onboarding/store' : '/onboarding/trial?error=' + encodeURIComponent('We could not confirm the checkout. Try again, or contact us if you were charged.'));
  }
  if (billingState(agency).hasAccess) redirect('/onboarding/store');

  const supabase = await supabaseServer();
  const { data } = await supabase.from('agencies').select('stores_band').eq('id', agency.id).single();
  const suggested = SUGGEST[data?.stores_band ?? ''] ?? 'agency';
  const chargeDay = new Date(Date.now() + TRIAL_DAYS * 864e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  const connected = stripeEnabled();

  return (
    <div className="onb">
      <OnboardingTop step={2} />
      <section className="onb-card">
        <div>
          <h1 style={{ fontSize: 30 }}>Start your {TRIAL_DAYS}-day free trial</h1>
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 16 }}>
            Pick a plan and add a card. Nothing is charged until {chargeDay}; cancel before then and you pay nothing.
          </p>
        </div>
        {q.error && <div className="notice error" role="alert">{q.error}</div>}
        {!connected && <div className="notice" role="status">Billing isn&apos;t connected on this server yet, so the trial can&apos;t be started here.</div>}
        <div className="plans">
          {PLAN_KEYS.map((key) => {
            const p = PLANS[key];
            return (
              <form key={key} action={choosePlan} className={`plan${key === suggested ? ' plan-current' : ''}`}>
                <input type="hidden" name="plan" value={key} />
                <input type="hidden" name="from" value="onboarding" />
                <h3>{p.name}{key === suggested && <span className="plan-tag">Suggested</span>}</h3>
                <div><span className="plan-price">${p.usd}</span> <span className="muted">a month</span></div>
                <div style={{ fontWeight: 600 }}>Up to {p.stores} stores</div>
                <div className="small muted" style={{ marginTop: -6 }}>First {TRIAL_DAYS} days free</div>
                <SubmitButton secondary={key !== suggested} pendingText="Opening checkout…" disabled={!connected}>
                  Start free trial
                </SubmitButton>
              </form>
            );
          })}
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Every plan has every feature. You can switch plans or cancel any time from Billing. Card details are handled by Stripe.
        </p>
      </section>
    </div>
  );
}

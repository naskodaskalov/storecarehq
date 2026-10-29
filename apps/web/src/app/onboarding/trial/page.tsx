import { redirect } from 'next/navigation';
import { billingState, PLAN_KEYS, PLANS, TRIAL_DAYS, type PlanKey } from '@/lib/billing';
import { requireAgency } from '@/lib/data';
import { supabaseServer } from '@/lib/supabase';
import { confirmCheckout } from '@/lib/stripe';
import { SubmitButton } from '@/components/submit-button';
import { choosePlan } from '@/app/(app)/billing/actions';
import { OnboardingFrame } from '../steps';
import { Icon } from '@/components/icon';

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

  return (
    <OnboardingFrame step={2}>
      <section className="onb-card">
        <div>
          <h1>A plan with room to grow.</h1>
          <p className="setup-description">
            Pick a plan and add a card. Nothing is charged until {chargeDay}; cancel before then and you pay nothing.
          </p>
        </div>
        {q.error && <div className="notice error" role="alert">{q.error}</div>}
        <div className="plans pricing-plans setup-pricing">
          {PLAN_KEYS.map((key) => {
            const p = PLANS[key];
            return (
              <form key={key} action={choosePlan} className={`plan pricing-plan${key === suggested ? ' pricing-agency plan-current' : ''}`}>
                <input type="hidden" name="plan" value={key} />
                <input type="hidden" name="from" value="onboarding" />
                <div className="pricing-plan-top"><span className="pricing-plan-icon"><Icon name="store" size={20} /></span>{key === suggested && <span className="pricing-recommendation">Suggested for you</span>}</div>
                <h3>{p.name}</h3>
                <div className="pricing-price"><span className="plan-price"><span className="pricing-currency">$</span>{p.usd}</span><span className="pricing-price-period">/ month</span></div>
                <div className="pricing-capacity"><Icon name="store" size={16} /><strong>Up to {p.stores} stores</strong></div>
                <ul className="pricing-features"><li><Icon name="check" size={14} />Every feature included</li><li><Icon name="check" size={14} />First {TRIAL_DAYS} days free</li></ul>
                <SubmitButton secondary={key !== suggested} pendingText="Opening checkout…">
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
    </OnboardingFrame>
  );
}

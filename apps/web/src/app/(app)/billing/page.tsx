import { redirect } from 'next/navigation';
import { billingState, checkoutTrial, PLAN_KEYS, PLANS, TRIAL_DAYS, TRIAL_STORE_LIMIT } from '@/lib/billing';
import { requireAgency } from '@/lib/data';
import { supabaseServer } from '@/lib/supabase';
import { confirmCheckout } from '@/lib/stripe';
import { SubmitButton } from '@/components/submit-button';
import { Icon } from '@/components/icon';
import { choosePlan, openPortal } from './actions';

type Search = { session_id?: string; changed?: string; error?: string; confirmed?: string };
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const ok = { background: 'var(--accent-soft)', borderColor: 'transparent' };

export default async function Billing({ searchParams }: { searchParams: Promise<Search> }) {
  const q = await searchParams;
  const { agency } = await requireAgency();
  if (q.session_id) {
    const done = await confirmCheckout(q.session_id, agency.id);
    redirect(done ? '/billing?confirmed=1' : '/billing');
  }
  const supabase = await supabaseServer();
  const { count } = await supabase.from('stores').select('id', { count: 'exact', head: true }).eq('agency_id', agency.id);
  const stores = count ?? 0;
  const s = billingState(agency);
  const firstPlan = 'trial_period_days' in checkoutTrial(agency); // never subscribed: 7 days free with a card

  return (
    <>
      <div className="page-heading billing-heading">
        <div>
        <h1>Plan and billing</h1>
        <p>A little care. A lot of peace of mind.</p>
        </div>
        <span className="billing-cadence"><Icon name="calendar" size={16} />Monthly billing · USD</span>
      </div>

      {q.error && <div className="notice error" role="alert">{q.error}</div>}
      {q.confirmed && <div className="notice" role="status" style={ok}>You&apos;re subscribed. Thank you! Monitoring carries on without a break.</div>}
      {q.changed && <div className="notice" role="status" style={ok}>Plan changed to {PLANS[q.changed as keyof typeof PLANS]?.name ?? q.changed}. The difference is prorated on your next invoice.</div>}

      <section className="card subscription-summary">
        <div className="subscription-kicker"><Icon name="billing" size={17} /><h2>Your workspace subscription</h2><span className="status-badge neutral">{s.onTrial ? 'Free trial' : s.paying ? 'Subscribed' : 'No active plan'}</span></div>
        {s.paying && s.plan ? (
          <>
            <p style={{ margin: 0, fontSize: 17 }}>
              <strong>{PLANS[s.plan].name}</strong>, ${PLANS[s.plan].usd} a month · {stores} of {s.storeLimit} stores used
            </p>
            {s.pastDue && (
              <p className="warn" style={{ margin: 0 }}>Your last payment failed. Update your card to keep monitoring running.</p>
            )}
            {s.endsAt ? (
              <p className="muted" style={{ margin: 0 }}>Cancelled. Monitoring stops on {day(s.endsAt)} unless you pick a plan again.</p>
            ) : agency.current_period_end ? (
              <p className="muted" style={{ margin: 0 }}>
                {agency.subscription_status === 'trialing' ? 'First payment on' : 'Renews on'} {day(agency.current_period_end)}.
              </p>
            ) : null}
            <form action={openPortal}>
              <SubmitButton secondary pendingText="Opening Stripe…">Update card, invoices or cancel</SubmitButton>
            </form>
          </>
        ) : s.onTrial ? (
          <p style={{ margin: 0, fontSize: 17 }}>
            <strong>Free trial</strong>: {s.trialDaysLeft} day{s.trialDaysLeft === 1 ? '' : 's'} left, until {day(agency.trial_ends_at!)} · {stores} of {TRIAL_STORE_LIMIT} stores.
            <span className="muted">
              {firstPlan
                ? ` Choose a plan to keep monitoring: it starts with ${TRIAL_DAYS} free days, then your card is charged.`
                : ' Choose a plan to keep monitoring.'}
            </span>
          </p>
        ) : firstPlan ? (
          <p style={{ margin: 0, fontSize: 17 }}>
            <strong>No plan yet.</strong> Choose one to start your {TRIAL_DAYS}-day free trial. You add a card now and pay nothing until the trial ends.
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 17 }}>
            <strong>{agency.stripe_subscription_id ? 'Your plan has ended.' : 'Your free trial has ended.'}</strong> Monitoring is paused and your data is kept. Choose a plan to start it again.
          </p>
        )}
      </section>

      <section aria-labelledby="plans-title" className="pricing-section">
        <div className="pricing-intro"><span className="pricing-eyebrow">ROOM TO GROW</span><h2 id="plans-title">Every store deserves great care.</h2><p>All the tools, on every plan. Just choose the space your agency needs.</p></div>
        <div className="plans pricing-plans">
          {PLAN_KEYS.map((key) => {
            const p = PLANS[key];
            const current = s.paying && s.plan === key && !s.endsAt;
            const tooSmall = stores > p.stores;
            return (
              <form key={key} action={choosePlan} className={`plan pricing-plan pricing-${key}${current ? ' plan-current' : ''}`}>
                <input type="hidden" name="plan" value={key} />
                <div className="pricing-plan-top"><span className="pricing-plan-icon"><Icon name={key === 'solo' ? 'store' : key === 'agency' ? 'home' : 'work'} size={22} /></span>{key === 'agency' && <span className="pricing-recommendation">Built for agencies</span>}</div>
                <div><h3>{p.name}</h3><p className="pricing-description">{key === 'solo' ? 'For your own corner of commerce.' : key === 'agency' ? 'For a growing client portfolio.' : 'For agencies thinking bigger.'}</p></div>
                <div className="pricing-price"><span className="plan-price"><span className="pricing-currency">$</span>{p.usd}</span><span className="pricing-price-period">/ month</span></div>
                <div className="pricing-capacity"><Icon name="store" size={18} /><strong>Up to {p.stores} client stores</strong></div>
                <ul className="pricing-features">{['Storefront & uptime monitoring', 'Daily checkout tests', 'Changes & detected apps', 'Care plans & work logs', 'Branded monthly reports'].map((feature) => <li key={feature}><Icon name="check" size={15} />{feature}</li>)}</ul>
                {current ? (
                  <span className="plan-note pricing-current"><Icon name="check" size={17} />Your current plan</span>
                ) : tooSmall ? (
                  <span className="plan-note muted pricing-unavailable">You have {stores} stores · limit {p.stores}</span>
                ) : (
                  <SubmitButton secondary={key !== 'agency'} pendingText={s.paying ? 'Changing…' : 'Opening checkout…'}>
                    {s.paying ? `Switch to ${p.name}` : firstPlan ? 'Start free trial' : `Choose ${p.name}`}
                  </SubmitButton>
                )}
              </form>
            );
          })}
        </div>
        <div className="pricing-reassurance"><span><Icon name="check" size={15} />Every feature included</span><span><Icon name="calendar" size={15} />Billed monthly</span><span><Icon name="check" size={15} />Cancel any time</span></div>
        <p className="small muted pricing-fineprint" style={{ margin: 0 }}>
          Prices in US dollars, billed monthly by Stripe. Cancel any time; your plan runs to the end of the month you paid for.
        </p>
      </section>
    </>
  );
}

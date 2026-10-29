import { redirect } from 'next/navigation';
import { billingState, checkoutTrial, PLAN_KEYS, PLANS, TRIAL_DAYS, TRIAL_STORE_LIMIT } from '@/lib/billing';
import { requireAgency } from '@/lib/data';
import { supabaseServer } from '@/lib/supabase';
import { confirmCheckout, stripeEnabled } from '@/lib/stripe';
import { SubmitButton } from '@/components/submit-button';
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
  const connected = stripeEnabled();
  const firstPlan = 'trial_period_days' in checkoutTrial(agency); // never subscribed: 7 days free with a card

  return (
    <>
      <div>
        <h1>Plan and billing</h1>
        <div className="muted">Every plan has every feature. Plans differ only by how many stores you look after.</div>
      </div>

      {q.error && <div className="notice error" role="alert">{q.error}</div>}
      {q.confirmed && <div className="notice" role="status" style={ok}>You&apos;re subscribed. Thank you! Monitoring carries on without a break.</div>}
      {q.changed && <div className="notice" role="status" style={ok}>Plan changed to {PLANS[q.changed as keyof typeof PLANS]?.name ?? q.changed}. The difference is prorated on your next invoice.</div>}
      {!connected && (
        <div className="notice" role="status">
          Billing isn&apos;t connected yet (no Stripe key on this server), so plans can&apos;t be bought here.
        </div>
      )}

      <section className="card">
        <h2>Your plan</h2>
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

      <section aria-labelledby="plans-title" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 id="plans-title">{s.paying ? 'Change plan' : 'Choose a plan'}</h2>
        <div className="plans">
          {PLAN_KEYS.map((key) => {
            const p = PLANS[key];
            const current = s.paying && s.plan === key && !s.endsAt;
            const tooSmall = stores > p.stores;
            return (
              <form key={key} action={choosePlan} className={`plan${current ? ' plan-current' : ''}`}>
                <input type="hidden" name="plan" value={key} />
                <h3>{p.name}</h3>
                <div><span className="plan-price">${p.usd}</span> <span className="muted">a month</span></div>
                <div style={{ fontWeight: 600 }}>Up to {p.stores} stores</div>
                {current ? (
                  <span className="plan-note">Your current plan</span>
                ) : tooSmall ? (
                  <span className="plan-note muted">You have {stores} stores</span>
                ) : (
                  <SubmitButton secondary={key !== 'agency'} pendingText={s.paying ? 'Changing…' : 'Opening checkout…'} disabled={!connected}>
                    {s.paying ? `Switch to ${p.name}` : firstPlan ? 'Start free trial' : `Choose ${p.name}`}
                  </SubmitButton>
                )}
              </form>
            );
          })}
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Prices in US dollars, billed monthly by Stripe. Cancel any time; your plan runs to the end of the month you paid for.
        </p>
      </section>
    </>
  );
}

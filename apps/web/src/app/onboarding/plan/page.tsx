import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import { host } from '@/lib/format';
import { SubmitButton } from '@/components/submit-button';
import { savePlan } from '../actions';
import { OnboardingFrame } from '../steps';

export default async function Step3({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  const { store: storeId } = await searchParams;
  if (!storeId) redirect('/');
  const supabase = await supabaseServer();
  const { data: store } = await supabase
    .from('stores')
    .select('id, public_url, checkout_consent_at, checkout_product_handle')
    .eq('id', storeId)
    .single();
  if (!store) redirect('/');

  return (
    <OnboardingFrame step={4}>
      <section className="onb-card">
        <div>
          <span className="chip" style={{ color: 'var(--accent)', background: 'var(--accent-soft)', borderColor: 'transparent', fontWeight: 600 }}>
            Added: {host(store.public_url)}
          </span>
          <h1 style={{ marginTop: 16 }}>Give this store a care plan.</h1>
          <p className="setup-description">Set the hours you’ve agreed with your client. We’ll connect your work log to their monthly report.</p>
        </div>
        <form action={savePlan} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <input type="hidden" name="store" value={store.id} />
          <div className="setup-plan-fields">
            <div className="field">
              <label htmlFor="plan">Plan name</label>
              <input id="plan" name="plan" type="text" defaultValue="Care Plan" />
            </div>
            <div className="field">
              <label htmlFor="hours">Hours included / month</label>
              <input id="hours" name="hours" type="number" min="0" step="0.5" defaultValue="10" className="mono" />
            </div>
            <div className="field">
              <label htmlFor="rollover">Unused hours</label>
              <select id="rollover" name="rollover" defaultValue="one_month">
                <option value="one_month">Roll over one month</option>
                <option value="expire">Expire</option>
              </select>
            </div>
          </div>

          {store.checkout_consent_at ? (
            <div className="panel">
              <strong style={{ fontSize: 14 }}>Daily checkout test</strong>
              <span className="small muted">
                Tests {store.checkout_product_handle ? <span className="mono">/products/{store.checkout_product_handle}</span> : 'the first product in the store'} at 06:00 store time.
              </span>
              <div className="row" style={{ justifyContent: 'flex-start', gap: 16 }}>
                <label className="check"><input type="checkbox" name="mobile" defaultChecked /> Test on mobile</label>
                <label className="check"><input type="checkbox" name="desktop" defaultChecked /> Test on desktop</label>
              </div>
            </div>
          ) : (
            <div className="panel small muted">The checkout test is off for this store. You can turn it on from the store page once the client agrees.</div>
          )}

          <div className="field">
            <label htmlFor="slack">Slack alerts for this client <span className="muted" style={{ fontWeight: 400 }}>(optional incoming-webhook URL)</span></label>
            <input id="slack" name="slack" type="url" placeholder="https://hooks.slack.com/services/…" />
            <span className="small muted">Incidents are emailed to you either way.</span>
          </div>

          <div className="row" style={{ borderTop: '1px solid var(--rule)', paddingTop: 16 }}>
            <span className="small muted">First checks start within 30 minutes.</span>
            <SubmitButton pendingText="Saving…">Start caring for this store →</SubmitButton>
          </div>
        </form>
      </section>
    </OnboardingFrame>
  );
}

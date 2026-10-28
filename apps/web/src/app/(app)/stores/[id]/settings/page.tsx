import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import { host } from '@/lib/format';
import { SubmitButton } from '@/components/submit-button';
import { deleteStore, saveStore, setPaused } from './actions';

const SAVED: Record<string, string> = {
  '1': 'Saved.',
  url: 'Saved. The address changed, so monitoring starts fresh with a new snapshot on the next run.',
  paused: 'Monitoring paused. No checks run for this store until you resume it.',
  resumed: 'Monitoring resumed. Checks start again on the next run.',
};

/** Common IANA zones first; the store's current zone is always included. */
function timezones(current: string): string[] {
  const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  const list = all.length ? all : ['UTC', 'Europe/London', 'Europe/Berlin', 'Europe/Sofia', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney'];
  return list.includes(current) ? list : [current, ...list];
}

export default async function StoreSettings({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const { saved, error } = await searchParams;
  const supabase = await supabaseServer();
  const [{ data: store }, { data: plan }, { data: slack }] = await Promise.all([
    supabase.from('stores').select('*').eq('id', id).single(),
    supabase.from('care_plans').select('name, hours_included, rollover_rule').eq('store_id', id).single(),
    supabase.from('alert_routes').select('target').eq('store_id', id).eq('channel', 'slack').limit(1),
  ]);
  if (!store) notFound();
  const paused = store.status === 'paused';

  return (
    <>
      <Link href={`/stores/${id}`} style={{ fontSize: 14, textDecoration: 'none' }}>← {store.name}</Link>
      <div style={{ marginTop: -12 }}>
        <h1>Store settings</h1>
        <div className="muted">{host(store.public_url)}{paused ? ' · monitoring paused' : ''}</div>
      </div>

      {saved && SAVED[saved] && <div className="notice" style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }} role="status">{SAVED[saved]}</div>}
      {error && <div className="notice error" role="alert">{error}</div>}

      <form action={saveStore} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <input type="hidden" name="store" value={store.id} />

        <section className="card">
          <h2>Store</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <div className="field">
              <label htmlFor="name">Store name</label>
              <input id="name" name="name" type="text" defaultValue={store.name} required />
            </div>
            <div className="field">
              <label htmlFor="url">Store address</label>
              <input id="url" name="url" type="text" defaultValue={host(store.public_url)} required className="mono" />
              <span className="small muted">Changing it starts monitoring fresh. History of checks stays.</span>
            </div>
            <div className="field">
              <label htmlFor="timezone">Store time zone</label>
              <select id="timezone" name="timezone" defaultValue={store.timezone}>
                {timezones(store.timezone).map((tz) => <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>)}
              </select>
              <span className="small muted">Daily checks run after 06:00 in this time zone.</span>
            </div>
          </div>
        </section>

        <section className="card">
          <h2>Client</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <div className="field">
              <label htmlFor="contact_name">Contact name</label>
              <input id="contact_name" name="contact_name" type="text" defaultValue={store.client_contact_name ?? ''} />
            </div>
            <div className="field">
              <label htmlFor="contact_email">Contact email <span className="muted" style={{ fontWeight: 400 }}>(gets the monthly report)</span></label>
              <input id="contact_email" name="contact_email" type="email" defaultValue={store.client_contact_email ?? ''} />
            </div>
          </div>
        </section>

        <section className="card">
          <h2>Care plan</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <div className="field">
              <label htmlFor="plan">Plan name</label>
              <input id="plan" name="plan" type="text" defaultValue={plan?.name ?? 'Care plan'} />
            </div>
            <div className="field">
              <label htmlFor="hours">Hours included / month</label>
              <input id="hours" name="hours" type="number" min="0" max="999" step="0.5" defaultValue={Number(plan?.hours_included ?? 0)} className="mono" />
            </div>
            <div className="field">
              <label htmlFor="rollover">Unused hours</label>
              <select id="rollover" name="rollover" defaultValue={plan?.rollover_rule ?? 'one_month'}>
                <option value="one_month">Roll over one month</option>
                <option value="expire">Expire</option>
              </select>
            </div>
          </div>
        </section>

        <section className="card">
          <h2>Checkout test</h2>
          <label className="check">
            <input type="checkbox" name="consent" defaultChecked={!!store.checkout_consent_at} />
            <span>
              Run the daily checkout test. We look after this store, and the client agrees to a daily test visit to their checkout.
              {store.checkout_consent_at && (
                <span className="small muted"> Agreed {new Date(store.checkout_consent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.</span>
              )}
            </span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            <div className="field">
              <label htmlFor="handle">Product to test <span className="muted" style={{ fontWeight: 400 }}>(handle from the product URL)</span></label>
              <div style={{ display: 'flex', alignItems: 'center', height: 46, border: '1px solid var(--border-strong)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                <span className="mono small muted" style={{ padding: '0 10px', background: 'var(--bg)', height: '100%', display: 'flex', alignItems: 'center', borderRight: '1px solid var(--border-strong)' }}>/products/</span>
                <input id="handle" name="handle" type="text" defaultValue={store.checkout_product_handle ?? ''} placeholder="first product in the store" className="mono" style={{ border: 0, height: '100%' }} />
              </div>
            </div>
            <div className="field">
              <span style={{ fontSize: 14, fontWeight: 500 }}>Devices</span>
              <div className="row" style={{ justifyContent: 'flex-start', gap: 16 }}>
                <label className="check" style={{ alignItems: 'center' }}><input type="checkbox" name="mobile" defaultChecked={store.checkout_mobile} style={{ marginTop: 0 }} /> Mobile</label>
                <label className="check" style={{ alignItems: 'center' }}><input type="checkbox" name="desktop" defaultChecked={store.checkout_desktop} style={{ marginTop: 0 }} /> Desktop</label>
              </div>
            </div>
          </div>
        </section>

        <section className="card">
          <h2>Alerts</h2>
          <div className="field">
            <label htmlFor="slack">Slack incoming-webhook URL for this client <span className="muted" style={{ fontWeight: 400 }}>(optional; leave empty to turn off)</span></label>
            <input id="slack" name="slack" type="url" defaultValue={slack?.[0]?.target ?? ''} placeholder="https://hooks.slack.com/services/…" />
            <span className="small muted">Risky changes and incidents post here. Incidents are also emailed to you.</span>
          </div>
        </section>

        <div className="row">
          <Link href={`/stores/${id}`} className="muted">Cancel</Link>
          <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
        </div>
      </form>

      <section className="card">
        <h2>{paused ? 'Monitoring is paused' : 'Pause monitoring'}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {paused
            ? 'No checks run for this store. Its history and reports are kept.'
            : 'Stops all checks for this store, for example while a client is between contracts. History and reports are kept.'}
        </p>
        <form action={setPaused}>
          <input type="hidden" name="store" value={store.id} />
          <input type="hidden" name="pause" value={paused ? '0' : '1'} />
          <SubmitButton secondary pendingText={paused ? 'Resuming…' : 'Pausing…'}>{paused ? 'Resume monitoring' : 'Pause monitoring'}</SubmitButton>
        </form>
      </section>

      <section className="card" style={{ borderColor: 'var(--warn-border)' }}>
        <h2 className="warn">Delete store</h2>
        <p className="muted" style={{ margin: 0 }}>
          Permanently removes this store with all its checks, changes, work log entries and reports. This can&apos;t be undone.
        </p>
        <form action={deleteStore} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <input type="hidden" name="store" value={store.id} />
          <div className="field" style={{ flex: '1 1 260px' }}>
            <label htmlFor="confirm">Type <strong>{store.name}</strong> to confirm</label>
            <input id="confirm" name="confirm" type="text" autoComplete="off" required />
          </div>
          <SubmitButton secondary pendingText="Deleting…" style={{ color: 'var(--warn)', borderColor: 'var(--warn-border)' }}>Delete store</SubmitButton>
        </form>
      </section>
    </>
  );
}

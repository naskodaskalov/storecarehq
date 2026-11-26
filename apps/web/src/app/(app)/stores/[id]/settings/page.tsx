import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import { host } from '@/lib/format';
import { SubmitButton } from '@/components/submit-button';
import { headers } from 'next/headers';
import { deleteStore, saveStore, setPaused, setPortal, retryAlert } from './actions';
import { CopyButton } from '@/components/copy-button';
import { portalUrl } from '@/lib/client-portal';
import { Icon } from '@/components/icon';

const SAVED: Record<string, string> = {
  '1': 'Saved.',
  alert: 'Alert queued again. It will be retried on the next monitoring run.',
  url: 'Saved. The address changed, so monitoring starts fresh with a new snapshot on the next run.',
  paused: 'Monitoring paused. No checks run for this store until you resume it.',
  resumed: 'Monitoring resumed. Checks start again on the next run.',
  portal_on: 'Client portal is on. Copy the link below and send it to your client.',
  portal_new: 'New portal link made. The old link no longer works.',
  portal_off: 'Client portal turned off. The link no longer works.',
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
  const [{ data: store }, { data: plan }, { data: slack }, deliveriesResult] = await Promise.all([
    supabase.from('stores').select('*').eq('id', id).single(),
    supabase.from('care_plans').select('name, hours_included, rollover_rule').eq('store_id', id).single(),
    supabase.from('alert_routes').select('target').eq('store_id', id).eq('channel', 'slack').limit(1),
    supabase.from('alert_deliveries').select('id, channel, subject, status, attempts, created_at, next_attempt_at, sent_at, last_error')
      .eq('store_id', id).order('created_at', { ascending: false }).limit(12),
  ]);
  if (!store) notFound();
  const paused = store.status === 'paused';
  const portalLink = store.portal_token ? portalUrl((await headers()).get('host') ?? '', store.portal_token) : null;

  return (
    <div className="workspace-page settings-page">
      <Link href={`/stores/${id}`} className="store-back"><Icon name="arrow" size={15} style={{ transform: 'rotate(180deg)' }} />{store.name}</Link>
      <header className="page-heading"><div>
        <h1>Store settings</h1>
        <p>{host(store.public_url)}{paused ? ' · monitoring paused' : ''}</p>
      </div><Link href={`/stores/${id}`} className="btn tertiary"><Icon name="store" size={16} />Store overview</Link></header>

      <nav className="store-section-nav" aria-label="Settings sections"><a href="#store-settings">Store</a><a href="#client-settings">Client</a><a href="#care-plan-settings">Care plan</a><a href="#checkout-settings">Checkout</a><a href="#alert-settings">Alerts</a><a href="#client-portal">Client portal</a></nav>

      {saved && SAVED[saved] && <div className="notice" style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }} role="status">{SAVED[saved]}</div>}
      {error && <div className="notice error" role="alert">{error}</div>}

      <form action={saveStore} className="workspace-settings-form">
        <input type="hidden" name="store" value={store.id} />

        <section className="workspace-section" id="store-settings">
          <h2>Store</h2>
          <div className="workspace-form-grid three-columns">
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

        <section className="workspace-section" id="client-settings">
          <h2>Client</h2>
          <div className="workspace-form-grid">
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

        <section className="workspace-section" id="care-plan-settings">
          <h2>Care plan</h2>
          <div className="workspace-form-grid three-columns">
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

        <section className="workspace-section" id="checkout-settings">
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
          <div className="workspace-form-grid">
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

        <section className="workspace-section" id="alert-settings">
          <h2>Alerts</h2>
          <div className="field">
            <label htmlFor="slack">Slack incoming-webhook URL for this client <span className="muted" style={{ fontWeight: 400 }}>(optional; leave empty to turn off)</span></label>
            <input id="slack" name="slack" type="url" defaultValue={slack?.[0]?.target ?? ''} placeholder="https://hooks.slack.com/services/…" />
            <span className="small muted">Risky changes and incidents post here. Incidents are also emailed to you.</span>
          </div>
        </section>

        <div className="row workspace-form-actions">
          <Link href={`/stores/${id}`} className="muted">Cancel</Link>
          <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
        </div>
      </form>

      <section className="workspace-section portal-settings" id="client-portal">
        <h2>Client portal</h2>
        <p className="muted" style={{ margin: 0 }}>
          An always-on page for your client, in your brand: live status, 30-day uptime, checkout and speed, care-plan hours,
          the work you did, past reports, and a form to send you requests. Requests land in <Link href="/requests">Requests</Link> and
          alert you like an incident. No login for the client: anyone with the link can open it.
        </p>
        {portalLink ? (
          <>
            <div className="portal-link-row">
              <input aria-label="Client portal link" readOnly value={portalLink} className="mono" />
              <CopyButton text={portalLink} />
              <a href={portalLink} target="_blank" rel="noopener" className="btn secondary">Open<span className="sr-only"> (new tab)</span></a>
            </div>
            <p className="small muted" style={{ margin: 0 }}>
              On since {new Date(store.portal_enabled_at ?? Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.
              Work entries show their client description; only approved or sent reports are listed.
            </p>
            <div className="row" style={{ justifyContent: 'flex-start', gap: 10 }}>
              <form action={setPortal}><input type="hidden" name="store" value={store.id} /><input type="hidden" name="op" value="rotate" />
                <SubmitButton secondary pendingText="Making a new link…">Make a new link</SubmitButton></form>
              <form action={setPortal}><input type="hidden" name="store" value={store.id} /><input type="hidden" name="op" value="off" />
                <SubmitButton secondary pendingText="Turning off…">Turn off</SubmitButton></form>
            </div>
          </>
        ) : (
          <form action={setPortal}>
            <input type="hidden" name="store" value={store.id} /><input type="hidden" name="op" value="on" />
            <SubmitButton pendingText="Turning on…"><Icon name="link" size={16} />Turn on client portal</SubmitButton>
          </form>
        )}
      </section>

      <section className="workspace-section workspace-table-section">
        <h2>Alert delivery history</h2>
        <p className="small muted" style={{ margin: 0 }}>Failed requests retry automatically on a monitoring run, up to six attempts. Accepted means the email or Slack provider accepted the message; it does not confirm it was read.</p>
        {deliveriesResult.error ? <p role="status" className="warn">Delivery history could not be loaded. Please try again shortly.</p>
          : !deliveriesResult.data?.length ? <p className="muted">No alerts have been sent for this store yet.</p>
            : <div className="table-wrap"><table>
              <thead><tr><th>Alert</th><th>Channel</th><th>Status</th><th>Attempts</th><th>Created</th></tr></thead>
              <tbody>{deliveriesResult.data.map((d) => <tr key={d.id}>
                <td>{d.subject}{d.last_error && <div className="small warn">{d.last_error}</div>}
                  {d.status === 'failed' && <form action={retryAlert} style={{ marginTop: 8 }}>
                    <input type="hidden" name="store" value={id} /><input type="hidden" name="delivery" value={d.id} />
                    <SubmitButton secondary pendingText="Queuing…">Retry alert</SubmitButton>
                  </form>}</td>
                <td>{d.channel === 'email' ? 'Email' : 'Slack'}</td>
                <td>{({ pending: 'Queued', sending: 'Sending', retry: 'Retry scheduled', sent: 'Accepted', failed: 'Needs attention', cancelled: 'Route removed or changed' } as Record<string, string>)[d.status] ?? d.status}
                  {d.status === 'retry' && <div className="small muted">From {new Date(d.next_attempt_at).toLocaleString('en-GB', { timeZone: store.timezone })} ({store.timezone})</div>}</td>
                <td>{d.attempts} / 6</td>
                <td className="small muted">{new Date(d.created_at).toLocaleString('en-GB', { timeZone: store.timezone })}</td>
              </tr>)}</tbody>
            </table></div>}
      </section>

      <section className="workspace-section workspace-secondary-section">
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

      <section className="workspace-section workspace-danger-section">
        <h2 className="warn">Delete store</h2>
        <p className="muted" style={{ margin: 0 }}>
          Permanently removes this store with all its checks, changes, work log entries and reports. This can&apos;t be undone.
        </p>
        <form action={deleteStore} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <input type="hidden" name="store" value={store.id} />
          <div className="field" style={{ flex: '1 1 220px' }}>
            <label htmlFor="confirm">Type <strong>{store.name}</strong> to confirm</label>
            <input id="confirm" name="confirm" type="text" autoComplete="off" required />
          </div>
          <SubmitButton danger pendingText="Deleting…">Delete store</SubmitButton>
        </form>
      </section>
    </div>
  );
}

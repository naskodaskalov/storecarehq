import Link from 'next/link';
import { Icon, type IconName } from '@/components/icon';
import { requireAdmin } from '@/lib/admin-session';
import { adminTimezone } from '@/lib/admin';
import { ago, figure, funnelSteps, loadAdminMetrics, monitoringStatus, percent, revenue, signupStatus, usd, type AdminMetrics, type Counts } from '@/lib/admin-metrics';
import './overview.css';

export const metadata = { title: 'Overview · StoreCare HQ admin', robots: { index: false, follow: false } };
// Always render per request: the numbers are live and the admin check reads the session.
export const dynamic = 'force-dynamic';

const added = (n: number) => (n > 0 ? `+${figure(n)}` : '0');

function GrowthTile({ icon, label, counts, note, href }: { icon: IconName; label: string; counts: Counts; note: string; href?: string }) {
  const body = <>
    <span className="overview-tile-label"><span className="overview-icon"><Icon name={icon} size={17} /></span>{label}{href && <span className="overview-tile-go"><Icon name="arrow" size={15} /></span>}</span>
    <span className="overview-tile-total">{figure(counts.total)}<span>total</span></span>
    <dl className="overview-tile-split">
      <div><dt>Today</dt><dd>{added(counts.today)}</dd></div>
      <div><dt>Last 7 days</dt><dd>{added(counts.week)}</dd></div>
    </dl>
    <span className="overview-tile-note">{note}</span>
  </>;
  return href ? <Link href={href} className="overview-tile metric-link">{body}</Link> : <div className="overview-tile">{body}</div>;
}

function Overview({ m, timeZone }: { m: AdminMetrics; timeZone: string }) {
  const money = revenue(m.subscriptions);
  const attention = m.subscriptions.past_due + m.subscriptions.cancelling;
  const monitoring = monitoringStatus(m.monitoring);
  const updated = new Date(m.generated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone });
  const plural = (n: number, one: string, many: string) => `${figure(n)} ${n === 1 ? one : many}`;

  return <>
    <section className="overview-tiles" aria-label="Growth">
      <GrowthTile icon="users" label="Users registered" counts={m.users} note={m.users.unconfirmed ? `${plural(m.users.unconfirmed, 'has', 'have')} not confirmed their email` : 'Every sign-up confirmed their email'} />
      <GrowthTile icon="store" label="Stores added" counts={m.stores} note={`${figure(m.stores.active)} active · ${figure(m.stores.limited)} limited · ${figure(m.stores.paused)} paused`} />
      <GrowthTile icon="home" label="Workspaces created" counts={m.workspaces} note={`${plural(m.subscriptions.no_card, 'has', 'have')} not added a card yet`} />
      <GrowthTile icon="mail" label="Outreach emails" counts={m.outreach} note={`${plural(m.outreach.agencies, 'agency', 'agencies')} contacted`} href="/admin/outreach" />
    </section>

    <section className="card overview-card" aria-labelledby="revenue-heading">
      <div className="overview-section-head"><h2 id="revenue-heading">Revenue</h2><span>Per month, at list prices</span></div>
      <dl className="overview-stats">
        <div><dt>Est. MRR</dt><dd>{usd(money.mrr)}</dd><span>{plural(money.paying, 'paying workspace', 'paying workspaces')}</span></div>
        <div><dt>Trials set to convert</dt><dd>{usd(money.pipeline)}</dd><span>{plural(money.converting, 'trial', 'trials')} with a card on file</span></div>
        <div><dt>Needs attention</dt><dd>{attention > 0 && <Icon name="alert" size={18} style={{ color: 'var(--warn)' }} />}{figure(attention)}</dd><span>{figure(m.subscriptions.past_due)} past due · {figure(m.subscriptions.cancelling)} cancelling</span></div>
        <div><dt>Ended</dt><dd>{figure(m.subscriptions.ended)}</dd><span>Subscriptions cancelled for good</span></div>
      </dl>
    </section>

    <div className="overview-grid">
      <section className="card overview-card" aria-labelledby="funnel-heading">
        <div className="overview-section-head"><h2 id="funnel-heading">Onboarding funnel</h2><span>All time · people</span></div>
        <ol className="overview-funnel">
          {funnelSteps(m.funnel).map((s, i) => <li key={s.key} title={`${s.label}: ${figure(s.count)} of ${figure(m.funnel.signed_up)} people${i ? ` · ${percent(s.fromPrevious)} of the step before` : ''}`}>
            <div className="overview-funnel-label"><strong>{s.label}</strong><span>{s.detail}</span></div>
            <div className="overview-funnel-track" aria-hidden="true"><span style={{ width: `${s.count ? Math.max(s.share * 100, 2) : 0}%` }} /></div>
            <div className="overview-funnel-value"><strong>{figure(s.count)}</strong><span>{i === 0 ? 'all sign-ups' : percent(s.share)}</span></div>
          </li>)}
        </ol>
        <p className="overview-footnote">A trial turns into a paid plan by itself when it ends, unless the agency cancels.</p>
      </section>

      <section className="card overview-card" aria-labelledby="recent-heading">
        <div className="overview-section-head"><h2 id="recent-heading">Recent sign-ups</h2><span>Newest first</span></div>
        {m.recent_signups.length ? <div className="table-wrap"><table className="overview-table">
          <thead><tr><th>Person</th><th>Signed up</th><th>Where they are</th><th className="num">Stores</th></tr></thead>
          <tbody>{m.recent_signups.map((s) => {
            const status = signupStatus(s, timeZone);
            return <tr key={`${s.email}-${s.created_at}`}>
              <td><a href={`mailto:${s.email}`} className="overview-person">{s.email}</a><span className="overview-sub">{s.workspace ?? 'No workspace yet'}</span></td>
              <td className="overview-when" title={new Date(s.created_at).toLocaleString('en-GB', { timeZone })}>{ago(s.created_at, m.generated_at, timeZone)}</td>
              <td><span className={`status-badge ${status.tone}`}>{status.label}</span></td>
              <td className="num">{figure(s.stores)}</td>
            </tr>;
          })}</tbody>
        </table></div> : <p className="table-empty">No sign-ups yet.</p>}
      </section>
    </div>

    <section className="overview-activity" aria-label="Product activity">
      <div><span>Reports sent</span><strong>{figure(m.activity.reports_sent_week)}</strong><small>Last 7 days</small></div>
      <div><span>Work logged</span><strong>{figure(m.activity.work_entries_week)}</strong><small>Entries, last 7 days</small></div>
      <div><span>Open incidents</span><strong>{figure(m.activity.open_incidents)}</strong><small>Stores down or failing checkout</small></div>
      <div><span>Monitoring</span><strong><Icon name={monitoring.ok ? 'check' : 'alert'} size={18} style={{ color: monitoring.ok ? 'var(--accent)' : 'var(--warn)' }} />{monitoring.ok ? 'Running' : 'Needs attention'}</strong><small>{monitoring.text}</small></div>
    </section>
    <p className="overview-updated">Updated {updated}. Reload the page for the latest numbers.</p>
  </>;
}

export default async function AdminOverviewPage() {
  await requireAdmin();
  const timeZone = adminTimezone();
  const { metrics, error } = await loadAdminMetrics(timeZone);
  return <div className="overview">
    <header className="overview-heading">
      <p className="overview-eyebrow">THE BUSINESS AT A GLANCE</p>
      <h1>Overview</h1>
      <p>Sign-ups, stores and revenue across every workspace. Days run midnight to midnight, {timeZone} time.</p>
    </header>
    {metrics ? <Overview m={metrics} timeZone={timeZone} /> : <p className="overview-error" role="alert"><Icon name="alert" size={18} />{error}</p>}
  </div>;
}

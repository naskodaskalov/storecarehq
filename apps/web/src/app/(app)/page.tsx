import Link from 'next/link';
import { activity, dashboard, requireAgency } from '@/lib/data';
import { host, hours, when, monthStartLabel } from '@/lib/format';
import { Icon } from '@/components/icon';
import { StoreTable } from '@/components/store-table';
import { ActivityLog } from '@/components/activity-log';
import { activityLines } from '@/lib/activity';
import { briefHeadline, briefItems, monthProgress, pace } from '@/lib/dashboard-brief';
import { countdown, inSeason, saleDates, shortDate } from '@/lib/bfcm';

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const { agency } = await requireAgency();
  const [d, log] = await Promise.all([dashboard(agency.id), activity(agency.id)]);
  const deletedNotice = deleted ? (
    <div className="notice" role="status" style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }}>
      {deleted} was deleted.
    </div>
  ) : null;

  const minutesByStore = new Map<string, number>();
  for (const w of d.work) if (w.counts_to_plan) minutesByStore.set(w.store_id, (minutesByStore.get(w.store_id) ?? 0) + w.minutes);
  const latestCheckout = new Map<string, { result: string; ran_at: string }>();
  for (const c of d.checkouts) if (!latestCheckout.has(c.store_id)) latestCheckout.set(c.store_id, c);

  const totalMinutes = [...minutesByStore.values()].reduce((a, b) => a + b, 0);
  const totalPlan = d.stores.reduce((a, s) => a + Number(s.care_plans?.hours_included ?? 0), 0);
  const over = d.stores.filter((s) => (minutesByStore.get(s.id) ?? 0) / 60 > Number(s.care_plans?.hours_included ?? Infinity)).length;
  const needsAttention = (s: typeof d.stores[number]) => s.status !== 'paused' && ((s.health_score ?? 100) < 90 || s.status === 'limited' || d.incidents.some((i) => i.store_id === s.id));
  const attention = d.stores.filter(needsAttention).length;
  const healthy = d.stores.filter((s) => s.status === 'active' && s.health_score !== null && s.health_score >= 90 && !needsAttention(s)).length;
  const drafts = d.reports.filter((r) => r.status === 'draft').length;
  const now = new Date();
  const storeRows = d.stores.map((s) => {
    const co = latestCheckout.get(s.id);
    const report = d.reports.find((r) => r.store_id === s.id);
    return { id: s.id, name: s.name, domain: host(s.public_url), score: s.health_score, status: s.status, attention: needsAttention(s), checkout: co ? { result: co.result, time: when(co.ran_at).time } : null, used: Number(hours(minutesByStore.get(s.id) ?? 0)), included: Number(s.care_plans?.hours_included ?? 0), report: report ? { id: report.id, status: report.status, period: report.period } : null, pace: pace({ included: Number(s.care_plans?.hours_included ?? 0), usedMinutes: minutesByStore.get(s.id) ?? 0 }, now) };
  });
  const briefInput = {
    now,
    stores: d.stores.map((s) => ({ id: s.id, name: s.name, status: s.status, included: Number(s.care_plans?.hours_included ?? 0), usedMinutes: minutesByStore.get(s.id) ?? 0 })),
    incidents: d.incidents, changes: d.changes, checkouts: d.checkouts, reports: d.reports,
  };
  const items = briefItems(briefInput);
  const headline = briefHeadline(briefInput, items);
  const monthEnd = monthProgress(now).endLabel;

  if (!d.stores.length) {
    return (
      <div className="workspace-page overview-page">
        <div className="page-heading"><h1>Client stores</h1></div>
        {deletedNotice}
        <section className="workspace-section">
          <h2>Add your first store</h2>
          <p className="muted" style={{ margin: 0 }}>Paste a client&apos;s store address and StoreCare starts watching it within 30 minutes.</p>
          <Link className="btn" href="/onboarding/store" style={{ alignSelf: 'flex-start' }}>Add store</Link>
        </section>
      </div>
    );
  }

  return (
    <div className="workspace-page overview-page">
      <div className="page-heading">
        <div>
          <h1>Overview</h1>
          <p className="brief-headline">{headline}</p>
        </div>
        <div className="page-actions"><span className="period-label"><Icon name="calendar" size={18} />{monthStartLabel()}</span><Link className="btn" href="/onboarding/store"><Icon name="plus" size={18} />Add store</Link></div>
      </div>
      {deletedNotice}
      {inSeason(now.getTime()) && (
        <section className="bfcm-banner" aria-labelledby="bfcm-banner-title">
          <div>
            <strong id="bfcm-banner-title">{countdown(now.getTime())}</strong>
            <p>Check all {d.stores.filter((s) => s.status !== 'paused').length} stores for Black Friday ({shortDate(saleDates(now.getTime()).blackFriday)}) and send each client a one-page result in your branding.</p>
          </div>
          <Link className="btn" href="/bfcm?run=all"><Icon name="tag" size={16} />Check all stores</Link>
        </section>
      )}

      <div className="kpis dashboard-kpis">
        <div className="kpi">
          <span className="metric-icon"><Icon name="store" /></span>
          <div className="small muted">Monitored stores</div>
          <div className="value">{d.stores.length}</div>
          <div className="small muted">{healthy} healthy · {attention} need attention</div>
        </div>
        <div className="kpi">
          <span className="metric-icon danger"><Icon name="alert" /></span>
          <div className="small muted">Active incidents</div>
          <div className="value">{d.incidents.length}</div>
          <div className="small muted">{d.incidents.length ? 'Requires your attention' : 'All clear'}</div>
        </div>
        <div className="kpi">
          <span className="metric-icon"><Icon name="clock" /></span>
          <div className="small muted">Hours this month</div>
          <div className="value">{hours(totalMinutes)}<span className="muted" style={{ fontSize: 15 }}> / {totalPlan}</span></div>
          {totalPlan > 0 && <progress value={totalMinutes / 60} max={totalPlan} aria-label="Monthly care plan hours used" />}
          <div className="small muted">{over} {over === 1 ? 'store' : 'stores'} over their plan</div>
        </div>
        <Link className="kpi metric-link" href="/reports">
          <span className="metric-icon blue"><Icon name="report" /></span>
          <div className="small muted">Reports to review</div>
          <div className="value">{drafts}</div>
          <div className="small muted">{drafts ? 'Drafts ready for review' : 'You’re all caught up'}</div>
        </Link>
      </div>

      <section className="brief" aria-labelledby="brief-title">
        <div className="brief-head">
          <h2 id="brief-title">Today, in order</h2>
          <span className="section-count">{items.length}</span>
          <span className="brief-note">Most urgent first. Plan pace is forecast to {monthEnd}.</span>
        </div>
        {items.length ? (
          <ol className="brief-list">
            {items.map((i, n) => (
              <li key={i.key} className={`brief-item ${i.tone}`}>
                <span className="brief-n" aria-hidden="true">{n + 1}</span>
                <div className="brief-copy">
                  <span className="brief-store">{i.store}</span>
                  <strong>{i.title}</strong>
                  <span>{i.detail}</span>
                </div>
                <Link className="btn secondary" href={i.href}>{i.action}</Link>
              </li>
            ))}
          </ol>
        ) : (
          <div className="brief-clear"><span className="brief-clear-mark" aria-hidden="true"><Icon name="check" size={18} /></span>Every store is quiet and every plan is on pace. StoreCare keeps watching; nothing needs you right now.</div>
        )}
      </section>

      <ActivityLog
        lines={activityLines({ now, stores: d.stores, changes: log.changes, incidents: log.incidents })}
        watching={d.stores.filter((s) => s.status !== 'paused').length}
        unavailable={log.error}
      />

      <StoreTable stores={storeRows} />
    </div>
  );
}

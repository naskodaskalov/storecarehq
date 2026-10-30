import Link from 'next/link';
import { dashboard, requireAgency } from '@/lib/data';
import { host, hours, when, monthStartLabel } from '@/lib/format';
import { Icon } from '@/components/icon';
import { StoreTable } from '@/components/store-table';

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { deleted } = await searchParams;
  const { agency } = await requireAgency();
  const d = await dashboard(agency.id);
  const deletedNotice = deleted ? (
    <div className="notice" role="status" style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }}>
      {deleted} was deleted.
    </div>
  ) : null;

  const minutesByStore = new Map<string, number>();
  for (const w of d.work) if (w.counts_to_plan) minutesByStore.set(w.store_id, (minutesByStore.get(w.store_id) ?? 0) + w.minutes);
  const latestCheckout = new Map<string, { result: string; ran_at: string }>();
  for (const c of d.checkouts) if (!latestCheckout.has(c.store_id)) latestCheckout.set(c.store_id, c);
  const storeName = new Map(d.stores.map((s) => [s.id, s.name]));

  const totalMinutes = [...minutesByStore.values()].reduce((a, b) => a + b, 0);
  const totalPlan = d.stores.reduce((a, s) => a + Number(s.care_plans?.hours_included ?? 0), 0);
  const over = d.stores.filter((s) => (minutesByStore.get(s.id) ?? 0) / 60 > Number(s.care_plans?.hours_included ?? Infinity)).length;
  const needsAttention = (s: typeof d.stores[number]) => s.status !== 'paused' && ((s.health_score ?? 100) < 90 || s.status === 'limited' || d.incidents.some((i) => i.store_id === s.id));
  const attention = d.stores.filter(needsAttention).length;
  const healthy = d.stores.filter((s) => s.status === 'active' && s.health_score !== null && s.health_score >= 90 && !needsAttention(s)).length;
  const drafts = d.reports.filter((r) => r.status === 'draft').length;
  const storeRows = d.stores.map((s) => {
    const co = latestCheckout.get(s.id);
    const report = d.reports.find((r) => r.store_id === s.id);
    return { id: s.id, name: s.name, domain: host(s.public_url), score: s.health_score, status: s.status, attention: needsAttention(s), checkout: co ? { result: co.result, time: when(co.ran_at).time } : null, used: Number(hours(minutesByStore.get(s.id) ?? 0)), included: Number(s.care_plans?.hours_included ?? 0), report: report ? { id: report.id, status: report.status, period: report.period } : null };
  });
  const unexplainedRisky = d.changes.filter((c) => c.risky && !c.work_entry_id).slice(0, 5);

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
          <p>Your client stores, at a glance.</p>
        </div>
        <div className="page-actions"><span className="period-label"><Icon name="calendar" size={18} />{monthStartLabel()}</span><Link className="btn" href="/onboarding/store"><Icon name="plus" size={18} />Add store</Link></div>
      </div>
      {deletedNotice}

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

      {(d.incidents.length > 0 || unexplainedRisky.length > 0) && (
        <section className="attention-section">
          <h2>Needs attention <span className="section-count">{d.incidents.length + unexplainedRisky.length}</span></h2>
          {d.incidents.map((i) => (
            <div key={i.id} className="attention-row incident-row">
              <span className="attention-icon danger"><Icon name="alert" /></span>
              <div className="attention-copy"><strong>{storeName.get(i.store_id)}</strong><span>{i.kind === 'down' ? 'Store is down' : 'Checkout test failed'} · {i.cause}</span></div>
              <Link className="btn secondary" href={`/stores/${i.store_id}`}>Investigate</Link>
            </div>
          ))}
          {unexplainedRisky.map((c) => (
            <div key={c.id} className="attention-row change-row">
              <span className="attention-icon warning"><Icon name="alert" /></span>
              <div className="attention-copy"><strong>{storeName.get(c.store_id)}</strong><span>{c.summary} · Not in your work log</span></div>
              <Link className="btn secondary" href={`/stores/${c.store_id}?change=${c.id}#change-details`}>View change</Link>
            </div>
          ))}
        </section>
      )}

      <StoreTable stores={storeRows} />
    </div>
  );
}

import Link from 'next/link';
import { dashboard, requireAgency } from '@/lib/data';
import { healthLabel, host, hours, when } from '@/lib/format';

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
  const changeCount = new Map<string, number>();
  for (const c of d.changes) changeCount.set(c.store_id, (changeCount.get(c.store_id) ?? 0) + 1);
  const storeName = new Map(d.stores.map((s) => [s.id, s.name]));

  const totalMinutes = [...minutesByStore.values()].reduce((a, b) => a + b, 0);
  const totalPlan = d.stores.reduce((a, s) => a + Number(s.care_plans?.hours_included ?? 0), 0);
  const over = d.stores.filter((s) => (minutesByStore.get(s.id) ?? 0) / 60 > Number(s.care_plans?.hours_included ?? Infinity)).length;
  const attention = d.stores.filter((s) => (s.health_score ?? 100) < 90 || s.status === 'limited').length;
  const unexplainedRisky = d.changes.filter((c) => c.risky && !c.work_entry_id).slice(0, 5);
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  if (!d.stores.length) {
    return (
      <>
        <h1>Client stores</h1>
        {deletedNotice}
        <section className="card">
          <h2>Add your first store</h2>
          <p className="muted" style={{ margin: 0 }}>Paste a client&apos;s store address and StoreCare starts watching it within 30 minutes.</p>
          <Link className="btn" href="/onboarding/store" style={{ alignSelf: 'flex-start' }}>Add store</Link>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div>
          <div className="small muted" style={{ fontSize: 14 }}>{today}</div>
          <h1>Client stores</h1>
        </div>
        <Link className="btn" href="/onboarding/store">Add store</Link>
      </div>
      {deletedNotice}

      <div className="kpis">
        <div className="kpi">
          <div className="small muted">Stores monitored</div>
          <div className="value">{d.stores.length}</div>
          <div className="small muted">{d.stores.length - attention} healthy · {attention} need attention</div>
        </div>
        <div className="kpi">
          <div className="small muted">Open incidents</div>
          <div className={`value ${d.incidents.length ? 'warn' : ''}`}>{d.incidents.length}</div>
          <div className="small muted">{d.incidents[0] ? `${storeName.get(d.incidents[0].store_id)} · ${d.incidents[0].kind}` : 'All clear'}</div>
        </div>
        <div className="kpi">
          <div className="small muted">Hours logged this month</div>
          <div className="value">{hours(totalMinutes)}<span className="muted" style={{ fontSize: 15 }}> / {totalPlan}</span></div>
          <div className="small muted">{over} {over === 1 ? 'store' : 'stores'} over their plan</div>
        </div>
        <div className="kpi">
          <div className="small muted">Changes, last 7 days</div>
          <div className="value">{d.changes.length}</div>
          <div className="small muted">{d.changes.filter((c) => !c.work_entry_id).length} not in your work log</div>
        </div>
      </div>

      {(d.incidents.length > 0 || unexplainedRisky.length > 0) && (
        <section className="card">
          <h2>Needs attention</h2>
          {d.incidents.map((i) => (
            <div key={i.id} className="notice row" style={{ justifyContent: 'flex-start', gap: '12px 20px' }}>
              <span className="chip warn">Incident</span>
              <div style={{ flex: '1 1 320px' }}><strong>{storeName.get(i.store_id)}</strong> — {i.kind === 'down' ? 'store is down' : 'checkout test failed'}: {i.cause}</div>
              <Link className="btn secondary" href={`/stores/${i.store_id}`}>Investigate</Link>
            </div>
          ))}
          {unexplainedRisky.map((c) => (
            <div key={c.id} className="row" style={{ justifyContent: 'flex-start', gap: '12px 20px', padding: '14px 16px', borderRadius: 10, background: 'var(--bg)' }}>
              <span className="chip">Change</span>
              <div style={{ flex: '1 1 320px' }}><strong>{storeName.get(c.store_id)}</strong> — {c.summary} (not in your work log)</div>
              <Link className="btn secondary" href={`/stores/${c.store_id}`}>View change</Link>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h2>All stores</h2>
        <div className="table-wrap">
          <table style={{ minWidth: 760 }}>
            <thead>
              <tr><th>Store</th><th>Health</th><th>Today&apos;s checkout test</th><th>Changes (7 days)</th><th>Hours used</th></tr>
            </thead>
            <tbody>
              {d.stores.map((s) => {
                const h = healthLabel(s.health_score);
                const co = latestCheckout.get(s.id);
                return (
                  <tr key={s.id}>
                    <td>
                      <Link href={`/stores/${s.id}`} style={{ color: 'var(--text)', fontWeight: 600, textDecoration: 'none' }}>{s.name}</Link>
                      <div className="small muted">{host(s.public_url)}{s.status === 'limited' ? ' · limited monitoring' : s.status === 'paused' ? ' · paused' : ''}</div>
                    </td>
                    <td className={`mono tone-${h.tone}`}>{s.health_score === null && s.status === 'limited' ? '—' : h.text}</td>
                    <td className={co?.result === 'fail' ? 'warn' : ''} style={{ fontWeight: co?.result === 'fail' ? 600 : 400 }}>
                      {co ? `${co.result === 'pass' ? 'Passed' : co.result === 'fail' ? 'Failed' : 'Blocked'} ${when(co.ran_at).time}` : <span className="muted">—</span>}
                    </td>
                    <td className="mono">{changeCount.get(s.id) ?? 0}</td>
                    <td className="mono">{hours(minutesByStore.get(s.id) ?? 0)} / {Number(s.care_plans?.hours_included ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

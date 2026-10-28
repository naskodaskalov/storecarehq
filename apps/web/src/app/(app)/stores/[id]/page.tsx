import Link from 'next/link';
import { notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import { healthLabel, host, hours, LIMITED_REASONS, monthStartLabel, when } from '@/lib/format';
import { monthStart } from '@/lib/data';
import { SubmitButton } from '@/components/submit-button';

type Search = { filter?: string; welcome?: string };

async function enableCheckout(formData: FormData) {
  'use server';
  const supabase = await supabaseServer();
  const id = String(formData.get('store'));
  await supabase.from('stores').update({ checkout_consent_at: new Date().toISOString() }).eq('id', id);
  revalidatePath(`/stores/${id}`);
}

export default async function StorePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params;
  const { filter = 'all', welcome } = await searchParams;
  const supabase = await supabaseServer();

  const { data: store } = await supabase
    .from('stores')
    .select('*, care_plans(name, hours_included)')
    .eq('id', id)
    .single();
  if (!store) notFound();

  const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const since14 = new Date(Date.now() - 14 * 864e5).toISOString();
  let changesQuery = supabase
    .from('changes')
    .select('id, occurred_at, kind, summary, risky, details, work_entry_id, work_entries(title)')
    .eq('store_id', id)
    .order('occurred_at', { ascending: false })
    .limit(30);
  if (filter === 'unexplained') changesQuery = changesQuery.is('work_entry_id', null);
  if (filter === 'matched') changesQuery = changesQuery.not('work_entry_id', 'is', null);

  const [changes, snapshot, uptime, speed, runs, incidents, work] = await Promise.all([
    changesQuery,
    supabase.from('storefront_snapshots').select('theme, apps, feed_status, taken_at').eq('store_id', id).order('taken_at', { ascending: false }).limit(1),
    supabase.from('uptime_checks').select('ok').eq('store_id', id).gte('checked_at', since30),
    supabase.from('speed_samples').select('performance_score, lcp_ms, sampled_at').eq('store_id', id).eq('page', 'home').order('sampled_at', { ascending: false }).limit(2),
    supabase.from('checkout_runs').select('ran_at, result, device, failed_step').eq('store_id', id).gte('ran_at', since14).order('ran_at'),
    supabase.from('incidents').select('id, kind, opened_at, resolved_at, cause').eq('store_id', id).order('opened_at', { ascending: false }).limit(1),
    supabase.from('work_entries').select('minutes, counts_to_plan').eq('store_id', id).gte('work_date', monthStart()),
  ]);

  const snap = snapshot.data?.[0];
  const up = uptime.data ?? [];
  const uptimePct = up.length ? (up.filter((u) => u.ok).length / up.length) * 100 : null;
  const [latestSpeed, prevSpeed] = speed.data ?? [];
  const usedMin = (work.data ?? []).filter((w) => w.counts_to_plan).reduce((a, w) => a + w.minutes, 0);
  const plan = store.care_plans as { name: string; hours_included: number } | null;
  const h = healthLabel(store.health_score);
  const lastIncident = incidents.data?.[0];
  const runList = runs.data ?? [];
  const lastRun = runList.at(-1);
  const apps = (snap?.apps ?? []) as { key: string; name: string; known: boolean }[];

  return (
    <>
      <Link href="/" style={{ fontSize: 14, textDecoration: 'none' }}>← All stores</Link>
      {welcome && (
        <div className="notice">
          <strong>{store.name} is being set up.</strong> The first storefront snapshot, uptime check and speed sample arrive within a few minutes.
          Changes appear from the second snapshot onwards.
        </div>
      )}
      <div className="row" style={{ alignItems: 'flex-end', marginTop: -12 }}>
        <div>
          <h1>{store.name}</h1>
          <div className="muted">
            {host(store.public_url)}{plan ? ` · ${plan.name} · ${plan.hours_included} h/month` : ''}{store.client_contact_name ? ` · contact: ${store.client_contact_name}` : ''}
          </div>
        </div>
        <Link className="btn secondary" href={`/work?store=${store.id}`}>Log time</Link>
      </div>

      {store.status === 'limited' && store.limited_reason && (
        <div className="notice"><strong>Limited monitoring.</strong> {LIMITED_REASONS[store.limited_reason] ?? store.limited_reason}</div>
      )}

      <div className="kpis">
        <div className="kpi">
          <div className="small muted">Health score</div>
          <div className={`value tone-${h.tone}`}>{store.health_score ?? '—'}</div>
          <div className="small muted">{h.tone === 'none' ? h.text : h.text.split(' · ')[1]}</div>
        </div>
        <div className="kpi">
          <div className="small muted">Uptime, 30 days</div>
          <div className="value">{uptimePct === null ? '—' : `${uptimePct.toFixed(2)}%`}</div>
          <div className="small muted">Checked every 5 min</div>
        </div>
        <div className="kpi">
          <div className="small muted">Mobile LCP (home)</div>
          <div className="value">{latestSpeed?.lcp_ms ? `${(latestSpeed.lcp_ms / 1000).toFixed(1)}s` : '—'}</div>
          <div className="small muted">
            {latestSpeed && prevSpeed?.lcp_ms && latestSpeed.lcp_ms
              ? `${latestSpeed.lcp_ms <= prevSpeed.lcp_ms ? '−' : '+'}${(Math.abs(latestSpeed.lcp_ms - prevSpeed.lcp_ms) / 1000).toFixed(1)}s vs previous`
              : 'Daily, PageSpeed Insights'}
          </div>
        </div>
        <div className="kpi">
          <div className="small muted">Hours this month</div>
          <div className="value">{hours(usedMin)}<span className="muted" style={{ fontSize: 15 }}> / {plan?.hours_included ?? 0}</span></div>
          <div className="small muted">{monthStartLabel()}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
        <section className="card" style={{ flex: '3 1 460px', minWidth: 0 }}>
          <div className="row">
            <h2>Change feed</h2>
            <div className="row small" style={{ gap: 8, justifyContent: 'flex-end' }}>
              {[
                ['all', 'All'],
                ['unexplained', 'Not in work log'],
                ['matched', 'Matched to work log'],
              ].map(([key, label]) => (
                <Link key={key} href={`/stores/${id}?filter=${key}`} className="chip" aria-current={filter === key ? 'true' : undefined}
                  style={filter === key ? { background: 'var(--accent-soft)', borderColor: 'transparent', color: 'var(--text)' } : { color: 'var(--text-2)', textDecoration: 'none' }}>
                  {label}
                </Link>
              ))}
            </div>
          </div>
          <div className="small muted">Changes are detected on the live storefront, so we can&apos;t see who made them. Changes that match your work log are linked to it.</div>
          <div className="feed">
            {(changes.data ?? []).length === 0 && <div className="muted" style={{ padding: '14px 0' }}>No changes detected yet.</div>}
            {(changes.data ?? []).map((c) => {
              const t = when(c.occurred_at, store.timezone);
              const entry = c.work_entries as unknown as { title: string } | null;
              const note = (c.details as { note?: string })?.note;
              return (
                <div key={c.id} className="feed-item">
                  <div className="feed-when">{t.date}<br />{t.time}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{c.summary}</div>
                    <div className={`small ${c.risky && !entry ? 'warn' : 'muted'}`} style={{ fontSize: 14 }}>
                      Detected · {entry ? `matched to work log: ${entry.title}` : 'not in work log'}{note ? ` · ${note}` : ''}
                    </div>
                  </div>
                  <div className={`small ${c.risky ? 'warn' : ''}`} style={{ fontWeight: 600 }}>{KIND_LABEL[c.kind] ?? c.kind}</div>
                </div>
              );
            })}
          </div>
        </section>

        <div style={{ flex: '2 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section className="card">
            <h2>Checkout test</h2>
            {!store.checkout_consent_at ? (
              <form action={enableCheckout} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input type="hidden" name="store" value={store.id} />
                <span className="small muted">Off. Turn it on once the client agrees to a daily test visit to their checkout.</span>
                <label className="check"><input type="checkbox" required /> We look after this store and the client agrees.</label>
                <SubmitButton secondary pendingText="Turning on…" style={{ alignSelf: 'flex-start' }}>Turn on checkout test</SubmitButton>
              </form>
            ) : (
              <>
                <div>
                  {lastRun ? (
                    <><span className={lastRun.result === 'pass' ? 'tone-good' : 'warn'} style={{ fontWeight: 600 }}>{RESULT[lastRun.result]}</span> {when(lastRun.ran_at, store.timezone).date} at {when(lastRun.ran_at, store.timezone).time} · {lastRun.device}{lastRun.failed_step ? ` · failed at ${lastRun.failed_step.replace('_', ' ')}` : ''}</>
                  ) : (
                    <span className="muted">First run at 06:00 store time.</span>
                  )}
                </div>
                {runList.length > 0 && (
                  <div role="img" aria-label={`Last 14 days: ${runList.filter((r) => r.result === 'pass').length} passed, ${runList.filter((r) => r.result === 'fail').length} failed`}
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(14, minmax(0, 1fr))', gap: 4 }}>
                    {runList.slice(-14).map((r, i) => (
                      <div key={i} style={{ height: 22, borderRadius: 4, background: r.result === 'pass' ? 'var(--accent-mid)' : r.result === 'fail' ? 'var(--warn)' : 'var(--border-strong)' }} />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          {lastIncident && (
            <section className="card" style={{ background: lastIncident.resolved_at ? 'var(--surface)' : 'var(--warn-bg)', borderColor: lastIncident.resolved_at ? 'var(--border)' : 'var(--warn-border)' }}>
              <h2 style={{ fontSize: 16 }} className={lastIncident.resolved_at ? '' : 'warn'}>
                {lastIncident.resolved_at ? 'Last incident · resolved' : 'Open incident'}
              </h2>
              <div>
                {when(lastIncident.opened_at, store.timezone).date} · {lastIncident.kind === 'down' ? 'Store down' : 'Checkout test failed'}: {lastIncident.cause}.
                {lastIncident.resolved_at ? ` Resolved ${when(lastIncident.resolved_at, store.timezone).date} at ${when(lastIncident.resolved_at, store.timezone).time}.` : ''}
              </div>
            </section>
          )}

          <section className="card">
            <div className="row"><h2>Apps detected</h2><span className="mono muted">{apps.length}</span></div>
            {snap?.theme && (
              <div className="small">Theme: <strong>{(snap.theme as { name?: string }).name}</strong> {(snap.theme as { schemaName?: string; schemaVersion?: string }).schemaName} {(snap.theme as { schemaVersion?: string }).schemaVersion}</div>
            )}
            <div className="small" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {apps.map((a) => <span key={a.key} className="chip" style={{ fontFamily: 'inherit', fontSize: 13 }}>{a.name}</span>)}
              {!apps.length && <span className="muted">Waiting for the first snapshot.</span>}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

const KIND_LABEL: Record<string, string> = {
  theme_published: 'Theme',
  theme_updated: 'Theme',
  app_added: 'Apps',
  app_removed: 'Apps',
  products_added: 'Products',
  products_removed: 'Products',
  prices_changed: 'Prices',
};
const RESULT: Record<string, string> = { pass: 'Passed', fail: 'Failed', blocked: 'Blocked' };

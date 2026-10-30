import Link from 'next/link';
import { notFound } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import { healthLabel, host, hours, LIMITED_REASONS, monthStartLabel, when } from '@/lib/format';
import { monthStart } from '@/lib/data';
import { SubmitButton } from '@/components/submit-button';
import { daysUntil, isOutOfStock, type ProductLite } from '@storecare/storefront';
import { HealthCheckStatus, type HealthCheck } from '@/components/health-check-status';
import { Icon } from '@/components/icon';

type Search = { filter?: string; welcome?: string; change?: string };

async function enableCheckout(formData: FormData) {
  'use server';
  const supabase = await supabaseServer();
  const id = String(formData.get('store'));
  await supabase.from('stores').update({ checkout_consent_at: new Date().toISOString() }).eq('id', id);
  revalidatePath(`/stores/${id}`);
}

export default async function StorePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params;
  const { filter = 'all', welcome, change } = await searchParams;
  const supabase = await supabaseServer();

  const { data: store } = await supabase
    .from('stores')
    .select('*, care_plans(name, hours_included)')
    .eq('id', id)
    .single();
  if (!store) notFound();
  const scan = await supabase.from('health_check_requests').select('id,source,status,requested_at,started_at,finished_at,phase,results')
    .eq('store_id', id).order('requested_at', { ascending: false }).limit(1).maybeSingle();

  // Fetch the requested change separately: it may be older than the feed's latest 30 rows.
  // Both store scope and the signed-in user's RLS apply to this lookup.
  const selected = change && /^[1-9]\d{0,18}$/.test(change) && BigInt(change) <= 9223372036854775807n
    ? await supabase.from('changes').select('id, occurred_at, kind, summary, risky, details, work_entry_id, work_entries(title)').eq('store_id', id).eq('id', change).maybeSingle()
    : null;
  const selectedChange = selected?.data;

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

  const now = new Date().toISOString();
  const since24h = new Date(Date.now() - 864e5).toISOString();
  const [changes, snapshot, uptime, uptimeDay, speed, runs, incidents, work, stockSnap, site] = await Promise.all([
    changesQuery,
    supabase.from('storefront_snapshots').select('theme, apps, feed_status, taken_at').eq('store_id', id).order('taken_at', { ascending: false }).limit(1),
    supabase.rpc('uptime_stats', { p_store: id, p_from: since30, p_to: now }),
    supabase.rpc('uptime_stats', { p_store: id, p_from: since24h, p_to: now }),
    supabase
      .from('speed_samples')
      .select('performance_score, lcp_ms, sampled_at, seo_score, accessibility_score, best_practices_score, field_scope, field_lcp_ms, field_inp_ms, field_category')
      .eq('store_id', id)
      .eq('page', 'home')
      .order('sampled_at', { ascending: false })
      .limit(2),
    supabase.from('checkout_runs').select('ran_at, result, device, failed_step').eq('store_id', id).gte('ran_at', since14).order('ran_at'),
    supabase.from('incidents').select('id, kind, opened_at, resolved_at, cause').eq('store_id', id).order('opened_at', { ascending: false }).limit(1),
    supabase.from('work_entries').select('minutes, counts_to_plan').eq('store_id', id).gte('work_date', monthStart()),
    supabase.from('storefront_snapshots').select('products, taken_at').eq('store_id', id).not('products', 'is', null).order('taken_at', { ascending: false }).limit(1),
    supabase.from('site_checks').select('checked_at, ssl_expires_at, ssl_issuer, ssl_error, domain, domain_expires_at, domain_error, pages_checked, broken').eq('store_id', id).order('checked_at', { ascending: false }).limit(1),
  ]);

  const snap = snapshot.data?.[0];
  type Stats = { checks: number; ok: number; avg_ms: number | null };
  const up = (uptime.data as Stats[] | null)?.[0];
  const uptimePct = up && Number(up.checks) ? (Number(up.ok) / Number(up.checks)) * 100 : null;
  const responseMs = (uptimeDay.data as Stats[] | null)?.[0]?.avg_ms ?? null;
  const products = (stockSnap.data?.[0]?.products ?? null) as ProductLite[] | null;
  const stockTracked = !!products && products.some((p) => p.soldOut);
  const soldOut = stockTracked ? products!.filter(isOutOfStock) : [];
  const siteCheck = site.data?.[0];
  const sslDays = daysUntil(siteCheck?.ssl_expires_at);
  const domainDays = daysUntil(siteCheck?.domain_expires_at);
  const broken = (siteCheck?.broken ?? []) as { url: string; status: number }[];
  const [latestSpeed, prevSpeed] = speed.data ?? [];
  const usedMin = (work.data ?? []).filter((w) => w.counts_to_plan).reduce((a, w) => a + w.minutes, 0);
  const plan = store.care_plans as { name: string; hours_included: number } | null;
  const h = healthLabel(store.health_score);
  const lastIncident = incidents.data?.[0];
  const runList = runs.data ?? [];
  const lastRun = runList.at(-1);
  const apps = (snap?.apps ?? []) as { key: string; name: string; known: boolean }[];

  return (
    <div className="store-details">
      <Link href="/#client-stores" className="store-back"><Icon name="arrow" size={15} style={{ transform: 'rotate(180deg)' }} />Client stores</Link>
      {welcome && (
        <div className="notice">
          <strong>{store.name} is being set up.</strong> Its first health check is queued and will start when a worker is available.
          Changes appear from the second snapshot onwards.
        </div>
      )}
      <header className="store-detail-header">
        <div className="store-detail-identity">
          <span className="store-detail-avatar" aria-hidden="true">{store.name.slice(0, 2).toUpperCase()}</span>
          <div>
            <div className="store-title-row"><h1>{store.name}</h1><span className={`store-monitor-status ${store.status === 'active' ? 'is-active' : ''}`}><span />{store.status === 'active' ? 'Monitoring active' : store.status === 'paused' ? 'Paused' : 'Limited monitoring'}</span></div>
            <div className="store-detail-meta">
              <a href={store.public_url} target="_blank" rel="noreferrer">{host(store.public_url)}<Icon name="arrow" size={13} style={{ transform: 'rotate(-45deg)' }} /></a>
              {plan && <span>{plan.name} · {plan.hours_included} h/month</span>}
              {store.client_contact_name && <span>{store.client_contact_name}</span>}
            </div>
          </div>
        </div>
        <div className="store-detail-actions">
          <Link className="btn secondary" href={`/stores/${store.id}/settings`}>Settings</Link>
          <Link className="btn" href={`/work?store=${store.id}`}><Icon name="plus" size={16} />Log time</Link>
        </div>
      </header>

      <nav className="store-section-nav" aria-label="Store sections">
        <a href="#store-overview">Overview</a><a href="#site-checks">Site checks</a><a href="#change-feed">Change feed</a><a href="#checkout-test">Checkout</a>
      </nav>

      {store.status === 'paused' && (
        <div className="notice">
          <strong>Monitoring is paused.</strong> No checks run for this store. <Link href={`/stores/${store.id}/settings`}>Resume in settings</Link>
        </div>
      )}
      {store.status === 'limited' && store.limited_reason && (
        <div className="notice"><strong>Limited monitoring.</strong> {LIMITED_REASONS[store.limited_reason] ?? store.limited_reason}</div>
      )}

      {change && <section className="card change-detail-card" id="change-details" aria-labelledby="change-details-title" tabIndex={-1}>
        <div className="row"><span className="small muted">CHANGE DETAILS</span><Link className="small" href={`/stores/${id}?filter=${encodeURIComponent(filter)}#change-feed`}>Back to change feed</Link></div>
        {selectedChange ? <>
          <h2 id="change-details-title">{selectedChange.summary}</h2>
          <div className="small muted">{KIND_LABEL[selectedChange.kind] ?? selectedChange.kind} · {when(selectedChange.occurred_at, store.timezone).date} at {when(selectedChange.occurred_at, store.timezone).time} ({store.timezone})</div>
          <p style={{ margin: 0 }} className={selectedChange.risky && !selectedChange.work_entry_id ? 'warn' : 'muted'}>
            {selectedChange.work_entry_id ? `Matched to work log: ${(selectedChange.work_entries as unknown as { title: string } | null)?.title ?? 'Linked work entry'}` : 'Not in your work log.'}
            {selectedChange.risky ? ' Flagged for review.' : ''}
          </p>
          <ChangeEvidence details={selectedChange.details} />
          <p className="small muted" style={{ margin: 0 }}>Detected on the public storefront. StoreCare can show what changed, but cannot identify who made the change.</p>
        </> : <>
          <h2 id="change-details-title">{selected?.error ? 'Could not load this change' : 'Change unavailable'}</h2>
          <p className="muted" style={{ margin: 0 }}>{selected?.error ? 'Please refresh the page to try again.' : 'This change could not be found for this store. You can still browse its change feed below.'}</p>
        </>}
      </section>}

      <section className="store-overview" id="store-overview" aria-label="Store overview">
        <div className="store-metric">
          <div className="store-metric-label"><Icon name="check" size={16} />Health score</div>
          <div className={`value tone-${h.tone}`}>{store.health_score ?? '—'}<span className="store-metric-unit"> / 100</span></div>
          <div className="small muted">{h.tone === 'none' ? h.text : h.text.split(' · ')[1]}</div>
        </div>
        <div className="store-metric">
          <div className="store-metric-label"><Icon name="clock" size={16} />Uptime</div>
          <div className="value">{uptimePct === null ? '—' : `${uptimePct.toFixed(2)}%`}</div>
          <div className="small muted">Last 30 days · every 30 min</div>
        </div>
        <div className="store-metric">
          <div className="store-metric-label"><Icon name="arrow" size={16} />Mobile load time</div>
          <div className={`value${latestSpeed?.lcp_ms && latestSpeed.lcp_ms > 4000 ? ' warn' : ''}`}>{latestSpeed?.lcp_ms ? `${(latestSpeed.lcp_ms / 1000).toFixed(1)}s` : '—'}</div>
          <div className="small muted">
            {latestSpeed && prevSpeed?.lcp_ms && latestSpeed.lcp_ms
              ? `${latestSpeed.lcp_ms <= prevSpeed.lcp_ms ? '−' : '+'}${(Math.abs(latestSpeed.lcp_ms - prevSpeed.lcp_ms) / 1000).toFixed(1)}s vs previous`
              : 'Daily, PageSpeed Insights'}
          </div>
        </div>
        <div className="store-metric">
          <div className="store-metric-label"><Icon name="work" size={16} />Care plan hours</div>
          <div className="value">{hours(usedMin)}<span className="store-metric-unit"> / {plan?.hours_included ?? 0} h</span></div>
          <div className="small muted">{monthStartLabel()}</div>
          {!!plan?.hours_included && <progress value={usedMin / 60} max={plan.hours_included} aria-label="Monthly care plan hours used" />}
        </div>
      </section>

      <HealthCheckStatus key={id} storeId={id} initial={scan.data as HealthCheck | null} initialTime={Date.now()} paused={store.status === 'paused'} unavailable={!!scan.error} />

      <div className="store-detail-grid">
        <div className="store-detail-primary">

          <section className="site-checks" id="site-checks" aria-labelledby="site-checks-title">
            <div className="store-section-heading"><h2 id="site-checks-title">Site checks</h2><span className="small muted">{siteCheck?.checked_at ? `Checked ${when(siteCheck.checked_at, store.timezone).date}` : 'Awaiting first check'}</span></div>
            <div className="site-checks-groups">
              <div className="site-checks-group">
                <h3>Performance</h3>
                <dl>
                  <Check
                    label="Real visitors' load"
                    value={latestSpeed?.field_lcp_ms ? `${(latestSpeed.field_lcp_ms / 1000).toFixed(1)}s` : '—'}
                    note={
                      latestSpeed?.field_lcp_ms
                        ? `Chrome visitors, 28 days${latestSpeed.field_category ? ` · ${FIELD[latestSpeed.field_category] ?? latestSpeed.field_category}` : ''}${latestSpeed.field_scope === 'origin' ? ' (whole site)' : ''}`
                        : latestSpeed
                          ? 'Not enough Chrome traffic for Google to report'
                          : 'Daily, from Google'
                    }
                    warn={latestSpeed?.field_category === 'SLOW'}
                  />
                  <Check label="Response time" value={responseMs ? `${responseMs} ms` : '—'} note="Average, last 24 hours" warn={!!responseMs && responseMs > 1500} />
                </dl>
              </div>
              <div className="site-checks-group">
                <h3>Storefront</h3>
                <dl>
                  <Check
                    label="Stock"
                    value={stockTracked ? `${soldOut.length} sold out` : '—'}
                    note={stockTracked ? `of ${products!.length} products${soldOut.length ? `: ${soldOut.slice(0, 2).map((p) => p.title).join(', ')}${soldOut.length > 2 ? '…' : ''}` : ''}` : 'From the next snapshot'}
                  />
                  <Check
                    label="Broken links"
                    value={siteCheck ? String(broken.length) : '—'}
                    note={siteCheck ? (broken.length ? broken.slice(0, 2).map((b) => b.url.replace(/^https?:\/\/[^/]+/, '')).join(', ') : `${siteCheck.pages_checked} pages checked`) : 'Daily'}
                    warn={broken.length > 0}
                  />
                </dl>
              </div>
              <div className="site-checks-group">
                <h3>Security &amp; domain</h3>
                <dl>
                  <Check
                    label="SSL certificate"
                    value={sslDays !== null ? `${sslDays} days` : '—'}
                    note={sslDays !== null ? `left${siteCheck?.ssl_issuer ? ` · ${siteCheck.ssl_issuer}` : ''}` : siteCheck?.ssl_error ? 'Could not read' : 'Daily'}
                    warn={sslDays !== null && sslDays <= 14}
                  />
                  <Check
                    label="Domain"
                    value={domainDays !== null ? `${domainDays} days` : '—'}
                    note={domainDays !== null ? `until ${siteCheck?.domain} expires` : siteCheck?.domain_error ? 'Expiry not published for this domain' : 'Daily'}
                    warn={domainDays !== null && domainDays <= 30}
                  />
                </dl>
              </div>
            </div>
            <div className="site-checks-audit">
              <h3>Google audit<span className="small muted">Daily · PageSpeed Insights</span></h3>
              <dl>
                <Check label="SEO" value={latestSpeed?.seo_score != null ? String(latestSpeed.seo_score) : '—'} />
                <Check label="Accessibility" value={latestSpeed?.accessibility_score != null ? String(latestSpeed.accessibility_score) : '—'} warn={latestSpeed?.accessibility_score != null && latestSpeed.accessibility_score < 80} />
                <Check label="Best practices" value={latestSpeed?.best_practices_score != null ? String(latestSpeed.best_practices_score) : '—'} />
              </dl>
            </div>
          </section>

          <section className="store-activity" id="change-feed" aria-labelledby="change-feed-title">
            <div className="store-section-heading">
              <h2 id="change-feed-title">Change feed <span className="section-count">{changes.data?.length ?? 0}</span></h2>
            </div>
            <nav className="store-feed-filters" aria-label="Change feed filters">
              {[
                ['all', 'All'],
                ['unexplained', 'Not in work log'],
                ['matched', 'Matched to work log'],
              ].map(([key, label]) => (
                <Link key={key} href={`/stores/${id}?filter=${key}#change-feed`} aria-current={filter === key ? 'true' : undefined}>
                  {label}
                </Link>
              ))}
            </nav>
            <div className="feed">
              {(changes.data ?? []).length === 0 && <div className="muted" style={{ padding: '14px 0' }}>No changes detected yet.</div>}
              {(changes.data ?? []).map((c) => {
                const t = when(c.occurred_at, store.timezone);
                const entry = c.work_entries as unknown as { title: string } | null;
                const note = (c.details as { note?: string })?.note;
                return (
                  <div key={c.id} className="feed-item">
                    <div className="feed-when"><strong>{t.date}</strong><span>{t.time}</span></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Link href={`/stores/${id}?filter=${encodeURIComponent(filter)}&change=${c.id}#change-details`} className="store-change-link">{c.summary}</Link>
                      <div className={`small ${c.risky && !entry ? 'warn' : 'muted'}`}>
                        Detected · {entry ? `matched to work log: ${entry.title}` : 'not in work log'}{note ? ` · ${note}` : ''}
                      </div>
                    </div>
                    <span className={`store-change-kind${c.risky ? ' is-risky' : ''}`}>{KIND_LABEL[c.kind] ?? c.kind}</span>
                  </div>
                );
              })}
            </div>
            <p className="store-activity-note">Detected on the public storefront. Changes can be matched to your work log, but not attributed to a person.</p>
          </section>
        </div>

        <aside className="store-detail-sidebar" aria-label="Store monitoring details">
          <section className="store-side-section" id="checkout-test">
            <div className="store-section-heading"><h2>Checkout test</h2><Icon name="store" size={18} /></div>
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
                    <><div className={`store-checkout-result ${lastRun.result === 'pass' ? 'tone-good' : 'warn'}`}><Icon name={lastRun.result === 'pass' ? 'check' : 'alert'} size={18} />{RESULT[lastRun.result]}</div><div className="small muted">{when(lastRun.ran_at, store.timezone).date} at {when(lastRun.ran_at, store.timezone).time} · {lastRun.device}{lastRun.failed_step ? ` · failed at ${lastRun.failed_step.replace('_', ' ')}` : ''}</div></>
                  ) : (
                    <span className="muted">First run at 06:00 store time.</span>
                  )}
                </div>
                {runList.length > 0 && (
                  <div role="img" aria-label={`Latest ${Math.min(runList.length, 14)} runs: ${runList.slice(-14).filter((r) => r.result === 'pass').length} passed, ${runList.slice(-14).filter((r) => r.result === 'fail').length} failed`}
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(14, minmax(0, 1fr))', gap: 4 }}>
                    {runList.slice(-14).map((r, i) => (
                      <div key={i} title={`${when(r.ran_at, store.timezone).date} · ${RESULT[r.result] ?? r.result}`} style={{ height: 28, borderRadius: 3, background: r.result === 'pass' ? 'var(--accent-mid)' : r.result === 'fail' ? 'var(--warn)' : 'var(--border-strong)' }} />
                    ))}
                  </div>
                )}
                {runList.length > 0 && <div className="store-history-caption"><span>Latest {Math.min(runList.length, 14)} runs</span><span>{store.timezone}</span></div>}
              </>
            )}
          </section>

          {lastIncident && (
            <section className={`store-side-section${lastIncident.resolved_at ? '' : ' store-incident-open'}`}>
              <h2 style={{ fontSize: 16 }} className={lastIncident.resolved_at ? '' : 'warn'}>
                {lastIncident.resolved_at ? 'Last incident · resolved' : 'Open incident'}
              </h2>
              <div>
                {when(lastIncident.opened_at, store.timezone).date} · {lastIncident.kind === 'down' ? 'Store down' : 'Checkout test failed'}: {lastIncident.cause}.
                {lastIncident.resolved_at ? ` Resolved ${when(lastIncident.resolved_at, store.timezone).date} at ${when(lastIncident.resolved_at, store.timezone).time}.` : ''}
              </div>
            </section>
          )}

          <section className="store-side-section">
            <div className="store-section-heading"><h2>Theme &amp; apps</h2><span className="section-count">{apps.length} apps</span></div>
            {snap?.theme && (
              <div className="store-theme"><span className="small muted">Published theme</span><strong>{(snap.theme as { name?: string }).name}</strong><span className="small muted">{(snap.theme as { schemaName?: string; schemaVersion?: string }).schemaName} {(snap.theme as { schemaVersion?: string }).schemaVersion}</span></div>
            )}
            <div className="small" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {apps.map((a) => <span key={a.key} className="chip" style={{ fontFamily: 'inherit', fontSize: 13 }}>{a.name}</span>)}
              {!apps.length && <span className="muted">{snap ? 'No apps detected in the latest snapshot.' : 'Waiting for the first snapshot.'}</span>}
            </div>
            {snap?.taken_at && <div className="store-snapshot-time">Snapshot · {when(snap.taken_at, store.timezone).date} at {when(snap.taken_at, store.timezone).time}</div>}
          </section>
        </aside>
      </div>
    </div>
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
  stock_out: 'Stock',
  stock_back: 'Stock',
};
const FIELD: Record<string, string> = { FAST: 'good', AVERAGE: 'needs improvement', SLOW: 'poor' };

const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
function changeValue(value: unknown) {
  const theme = record(value);
  return text(value) || [text(theme.name) || text(theme.schemaName), text(theme.schemaVersion)].filter(Boolean).join(' · ') || (theme.id ? `Theme ${text(theme.id)}` : 'Not recorded');
}

function ChangeEvidence({ details }: { details: unknown }) {
  const d = record(details);
  const edits = Array.isArray(d.edits) ? d.edits.map(record) : [];
  const products = Array.isArray(d.products) ? d.products.map(record) : [];
  const evidence = Array.isArray(d.evidence) ? d.evidence.map(text).filter(Boolean) : [];
  const comparison = 'from' in d || 'to' in d;
  return <>
    {text(d.note) && <div className="notice" style={{ margin: 0 }}>{text(d.note)}</div>}
    {comparison && <div className="change-comparison">
      <div><span className="small muted">BEFORE</span><strong>{changeValue(d.from)}</strong></div>
      <div><span className="small muted">AFTER</span><strong>{changeValue(d.to)}</strong></div>
    </div>}
    {text(d.app) && <div><span className="small muted">App detected</span><p style={{ margin: '4px 0 0', overflowWrap: 'anywhere' }}>{text(d.app)}</p></div>}
    {evidence.length > 0 && <details><summary>Detection evidence</summary><ul className="small">{evidence.map((item, i) => <li key={i} style={{ overflowWrap: 'anywhere' }}>{item}</li>)}</ul></details>}
    {edits.length > 0 && <div className="change-evidence-scroll" tabIndex={0} role="region" aria-label="Recorded price changes">
      <table><caption className="small muted" style={{ textAlign: 'left', paddingBottom: 10 }}>Recorded price changes · values as reported by the storefront</caption><thead><tr><th scope="col">Product</th><th scope="col">Variant ID</th><th scope="col">Before</th><th scope="col">After</th></tr></thead>
        <tbody>{edits.map((edit, i) => <tr key={i}><td>{text(edit.title) || `Product ${text(edit.id)}`}</td><td>{text(edit.variant)}</td><td>{text(edit.from)}</td><td>{text(edit.to)}</td></tr>)}</tbody>
      </table>
    </div>}
    {products.length > 0 && <div className="change-evidence-scroll" tabIndex={0} role="region" aria-label="Affected products"><strong>Affected products ({products.length})</strong><ul>{products.map((product, i) => <li key={i}>{text(product.title) || `Product ${text(product.id)}`}</li>)}</ul></div>}
    {!text(d.note) && !comparison && !text(d.app) && !edits.length && !products.length && <p className="muted" style={{ margin: 0 }}>No additional detail was recorded for this change.</p>}
  </>;
}

function Check({ label, value, note, warn }: { label: string; value: string; note?: string; warn?: boolean }) {
  return (
    <div className={`site-check${warn ? ' site-check-warning' : ''}`}>
      <dt>{label}{warn && <span className="site-check-alert">Needs attention</span>}</dt>
      <dd className="site-check-value">{value}</dd>
      {note && <dd className="site-check-note">{note}</dd>}
    </div>
  );
}
const RESULT: Record<string, string> = { pass: 'Passed', fail: 'Failed', blocked: 'Blocked' };

// The client-facing report. Used in the builder's preview and on the public /r/<token> page,
// so what the agency approves is exactly what the client sees.

import type { Facts, Sections } from '@storecare/reports';

const pct = (n: number) => `${n % 1 === 0 ? n : n.toFixed(2)}%`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function ReportView({
  facts,
  summary,
  sections,
  logoUrl,
}: {
  facts: Facts;
  summary: string;
  sections: Sections;
  logoUrl?: string | null;
}) {
  const brand = /^#[0-9a-f]{6}$/i.test(facts.brandColor) ? facts.brandColor : '#2747A8';
  const f = facts;
  const hoursLine =
    f.work.hoursIncluded !== null
      ? `${f.work.hoursUsed}h of ${f.work.hoursIncluded + f.work.rolledOver}h${f.work.rolledOver ? ` (incl. ${f.work.rolledOver}h rolled over)` : ''}`
      : `${f.work.hoursUsed}h`;

  return (
    <article className="report" style={{ ['--brand' as string]: brand }}>
      <header className="report-head">
        <div className="report-agency">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={f.agencyName} style={{ height: 32 }} />
          ) : (
            <span className="report-mark">{f.agencyName.slice(0, 1)}</span>
          )}
          <span>{f.agencyName}</span>
        </div>
        <div className="report-kicker">Monthly care report · {f.period.label}</div>
        <h1 className="report-title">{f.storeName}</h1>
        <div className="report-sub">{f.storeHost}</div>
      </header>

      {sections.summary && summary.trim() && (
        <section className="report-summary">
          <p>{summary}</p>
        </section>
      )}

      {sections.checks && (
        <section className="report-section">
          <h2>Store health</h2>
          <div className="report-stats">
            <Stat label="Uptime" value={f.uptimePct !== null ? pct(f.uptimePct) : '—'} note={f.uptimeChecks ? `${f.uptimeChecks.toLocaleString('en-GB')} checks` : 'Not measured'} />
            <Stat
              label="Checkout test"
              value={f.checkout ? `${f.checkout.passed}/${f.checkout.runs}` : '—'}
              note={f.checkout ? `daily runs passed${f.checkout.failed ? ` · ${f.checkout.failed} failed` : ''}` : 'Not running'}
            />
            <Stat
              label="Mobile load"
              value={f.speed?.lcpEnd ? secs(f.speed.lcpEnd) : '—'}
              note={
                f.speed?.lcpEnd && f.speed.lcpStart && f.speed.lcpStart !== f.speed.lcpEnd
                  ? `${f.speed.lcpEnd < f.speed.lcpStart ? '−' : '+'}${secs(Math.abs(f.speed.lcpEnd - f.speed.lcpStart))} this month`
                  : 'Largest content, home page'
              }
            />
            <Stat label="Health score" value={f.healthScore !== null ? String(f.healthScore) : '—'} note="out of 100" />
          </div>
          {f.limited && <p className="report-note">Some checks are limited on this store because of how it is set up.</p>}
        </section>
      )}

      {sections.incidents && (
        <section className="report-section">
          <h2>Incidents</h2>
          {f.incidents.length === 0 ? (
            <p className="report-empty">No incidents this month.</p>
          ) : (
            <ul className="report-list">
              {f.incidents.map((i, n) => (
                <li key={n}>
                  <span className="report-date">{i.when}</span>
                  <span>
                    <strong>{i.title}</strong>
                    {i.minutesToFix ? ` · fixed in ${i.minutesToFix} min` : i.resolved ? ' · resolved' : ' · being handled'}
                    {i.note && <span className="report-muted"> {i.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {sections.work && (
        <section className="report-section">
          <h2>
            Work we did <span className="report-muted">{hoursLine}{f.work.planName ? ` · ${f.work.planName}` : ''}</span>
          </h2>
          {f.work.entries.length === 0 ? (
            <p className="report-empty">No care work was needed this month.</p>
          ) : (
            <ul className="report-list">
              {f.work.entries.map((w, n) => (
                <li key={n}>
                  <span className="report-date">{w.date}</span>
                  <span>{w.text}</span>
                  <span className="report-hours">{w.hours}h</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {sections.changes && f.changes.total > 0 && (
        <section className="report-section">
          <h2>
            Changes to the store <span className="report-muted">{f.changes.total} detected</span>
          </h2>
          <ul className="report-list">
            {f.changes.highlights.map((c, n) => (
              <li key={n}>
                <span className="report-date">{c.when}</span>
                <span>
                  {c.summary}
                  {c.byAgency && <span className="report-muted"> · our work</span>}
                </span>
              </li>
            ))}
          </ul>
          {f.changes.total > f.changes.highlights.length && (
            <p className="report-note">The {f.changes.highlights.length} most significant of {f.changes.total} changes.</p>
          )}
        </section>
      )}

      {sections.recommendations && f.recommendations.length > 0 && (
        <section className="report-section">
          <h2>Recommendations</h2>
          <ol className="report-recs">
            {f.recommendations.map((r, n) => (
              <li key={n}>
                <strong>{r.title}.</strong> {r.detail}
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer className="report-foot">
        Prepared by {f.agencyName} · Monitored daily with StoreCare HQ
      </footer>
    </article>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="report-stat">
      <div className="report-stat-label">{label}</div>
      <div className="report-stat-value">{value}</div>
      <div className="report-stat-note">{note}</div>
    </div>
  );
}

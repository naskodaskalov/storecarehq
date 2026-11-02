'use client';

import { useState } from 'react';
import { QUICK_MS, SLOW_MS } from '@/lib/scan-findings';
import { shortDate } from '@/lib/store-memory';
import { previewRecommendations, previewSummary, reportClock, storeName } from '@/lib/store-preview';
import type { CheckedStore } from './brand-context';

const n = (x: number) => x.toLocaleString('en-US');

/** The checked store's report as it would start today: the real report's layout, filled only with what the
 *  visitor's own checks saw, and a strip showing how much StoreCare would add before it drafts. */
export function StorePreview({ checked, agency, brand }: { checked: CheckedStore; agency: string; brand: string }) {
  const [now] = useState(() => new Date());
  const { scan, memory } = checked;
  const clock = reportClock(now);
  const name = storeName(scan, memory);
  const looks = memory.looks.length;
  const recs = previewRecommendations(scan, memory);
  // As in the real report: significant changes first, then newest first, at most five.
  const recent = [...memory.changes].sort((a, b) => Number(b.risky) - Number(a.risky) || b.at.localeCompare(a.at)).slice(0, 5);
  const speed = scan.responseMs < QUICK_MS ? 'quick' : scan.responseMs < SLOW_MS ? 'fine' : 'slow on mobile';

  return (
    <article className="report lp-pv" style={{ ['--brand' as string]: brand }}>
      <header className="report-head">
        <div className="report-agency">
          <span className="report-mark">{agency.slice(0, 1)}</span>
          <span>{agency}</span>
        </div>
        <div className="report-kicker">Monthly care report · {clock.month}</div>
        <h2 className="report-title">{name}</h2>
        <div className="report-sub">{scan.host}</div>
      </header>

      <MonthTrack looks={memory.looks} clock={clock} />

      <section className="report-summary">
        <p>{previewSummary(scan, memory, clock.monthName)}</p>
      </section>

      <section className="report-section">
        <h2>
          Store health <span className="report-muted">{looks === 1 ? 'from our first check' : `latest of ${looks} checks`}</span>
        </h2>
        <div className="report-stats">
          <Stat label="First response" value={`${(scan.responseMs / 1000).toFixed(1)}s`} note={`home page · ${speed}`} />
          <Stat label="Apps on every page" value={String(scan.appCount)} note={scan.unknownApps ? `${scan.unknownApps} not recognised` : scan.appCount ? 'all recognised' : 'none detected'} />
          <Stat
            label="Products"
            value={scan.products ? `${scan.products.count}${scan.products.more ? '+' : ''}` : '—'}
            note={scan.products ? (scan.soldOut ? `${scan.soldOut} with sold-out sizes` : 'nothing sold out') : 'list not public'}
          />
        </div>
        {scan.note && <p className="report-note">{scan.note}</p>}
      </section>

      <section className="report-section">
        <h2>On the storefront</h2>
        <ul className="report-list">
          <li>
            <span className="report-check">Live theme</span>
            <span>{scan.theme ?? 'Not visible from outside'}</span>
          </li>
          <li>
            <span className="report-check">Apps</span>
            <span>
              {scan.apps.length ? scan.apps.join(', ') : 'None detected'}
              {scan.appCount > scan.apps.length && <span className="report-muted"> and {scan.appCount - scan.apps.length} more</span>}
            </span>
          </li>
        </ul>
      </section>

      {looks > 1 && (
        <section className="report-section">
          <h2>
            Changes to the store <span className="report-muted">{memory.changes.length} since {shortDate(memory.looks[0])}</span>
          </h2>
          {recent.length ? (
            <ul className="report-list">
              {recent.map((c, i) => (
                <li key={`${c.at}-${i}`} className={c.risky ? 'lp-pv-risky' : undefined}>
                  <span className="report-date">{shortDate(c.at)}</span>
                  <span>
                    {c.summary}
                    {c.risky && <span className="report-muted"> · worth a look</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="report-empty">No changes between your checks. Quiet weeks go in the report too.</p>
          )}
          {memory.changes.length > recent.length && <p className="report-note">The {recent.length} most significant of {memory.changes.length} changes.</p>}
        </section>
      )}

      {recs.length > 0 && (
        <section className="report-section">
          <h2>Recommendations</h2>
          <ol className="report-recs">
            {recs.map((r) => (
              <li key={r.title}>
                <strong>{r.title}.</strong> {r.detail}
              </li>
            ))}
          </ol>
        </section>
      )}

      <footer className="report-foot">Prepared by {agency} · Monitored daily with StoreCare HQ</footer>
    </article>
  );
}

/** This month as a bar: the visitor's own checks as dots, and from today on, StoreCare's every-30-minutes checks. */
function MonthTrack({ looks, clock }: { looks: string[]; clock: ReturnType<typeof reportClock> }) {
  const span = clock.end.getTime() - clock.start.getTime();
  const at = (iso: string) => (Date.parse(iso) - clock.start.getTime()) / span;
  const inMonth = looks.filter((l) => at(l) >= 0 && at(l) <= 1);
  const now = Math.min(100, Math.max(0, clock.progress * 100));
  const startLabel = clock.start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const endLabel = clock.end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const yours = looks.length === 1 ? 'So far, just your one check.' : `So far, your ${looks.length} checks since ${shortDate(looks[0])}.`;

  return (
    <div className="lp-pv-track">
      <div className="lp-pv-track-head">
        <span className="lp-pv-badge">Preview</span>
        <span>{clock.late ? `First full report: ${clock.next.draftsOn}` : `Drafts itself on ${clock.draftsOn}`}</span>
      </div>
      <div className="lp-pv-bar" aria-hidden="true">
        <span className="lp-pv-past" style={{ width: `${now}%` }} />
        <span className="lp-pv-future" style={{ left: `${now}%` }} />
        {inMonth.map((l) => (
          <i key={l} className="lp-pv-look" style={{ left: `${at(l) * 100}%` }} />
        ))}
      </div>
      <div className="lp-pv-scale" aria-hidden="true">
        <span>{startLabel}</span>
        <span className="lp-pv-key">
          <i className="lp-pv-key-look" />your checks <i className="lp-pv-key-sc" />StoreCare, every 30 minutes
        </span>
        <span>{endLabel}</span>
      </div>
      <p className="lp-pv-count">
        {yours}{' '}
        {clock.late ? (
          <>Start watching today and the first full report drafts on {clock.next.draftsOn}, built from about <b>{n(clock.next.uptime)}</b> uptime checks, <b>{clock.next.daily}</b> checkout tests and <b>{clock.next.daily}</b> speed readings.</>
        ) : (
          <>Start watching today and StoreCare adds about <b>{n(clock.uptimeLeft)}</b> uptime checks, <b>{clock.dailyLeft}</b> checkout tests and <b>{clock.dailyLeft}</b> speed readings before it drafts.</>
        )}
      </p>
    </div>
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

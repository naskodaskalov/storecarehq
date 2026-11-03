'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ActivityLine } from '@/lib/activity';
import { whenLabel } from '@/lib/day';

const REFRESH_MS = 60_000;
const FILTERS = [
  ['all', 'All'],
  ['flagged', 'Flagged'],
  ['incident', 'Incidents'],
  ['change', 'Changes'],
] as const;
type Filter = (typeof FILTERS)[number][0];

/** Every client store's changes and incidents in one log, newest first. It refreshes itself every minute
 *  while the page is open; new lines drop in at the top. Pause stops the refresh (and so does hovering). */
export function ActivityLog({ lines, watching, unavailable }: { lines: ActivityLine[]; watching: number; unavailable?: boolean }) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  // One clock for the whole log: the viewer's. Until the browser says which, the server's store-time labels show.
  const [zone, setZone] = useState<string | null>(null);
  useEffect(() => setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || null), []);

  useEffect(() => {
    const ids = new Set(lines.map((l) => l.id));
    if (seen.current) setFresh(new Set([...ids].filter((id) => !seen.current!.has(id))));
    seen.current = ids;
  }, [lines]);

  useEffect(() => {
    if (paused || hovering) return;
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [paused, hovering, router]);

  const shown = lines.filter((l) => filter === 'all' || (filter === 'flagged' ? l.flagged : l.kind === filter));
  return (
    <section className={`activity${paused ? ' paused' : ''}`} aria-labelledby="activity-title" onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
      <div className="activity-head">
        <h2 id="activity-title">Activity</h2>
        <span className="activity-live" aria-hidden="true" />
        <span>{paused ? 'Paused' : `Watching ${watching} client ${watching === 1 ? 'store' : 'stores'}`}</span>
        <div className="activity-filters" role="group" aria-label="Show">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>
        <button type="button" className="activity-pause" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>{paused ? 'Resume' : 'Pause'}</button>
      </div>
      {unavailable ? (
        <p className="activity-empty">The activity log could not be loaded. Please refresh the page to try again.</p>
      ) : shown.length === 0 ? (
        <p className="activity-empty">{lines.length ? 'Nothing here in the last two weeks.' : 'No changes or incidents in the last two weeks. StoreCare keeps watching.'}</p>
      ) : (
        <ol className="activity-list" aria-live="off">
          {shown.map((l) => (
            <li key={l.id} className={`activity-item ${l.tone}${fresh.has(l.id) ? ' fresh' : ''}`}>
              <time className="activity-when" dateTime={l.at}>{zone ? whenLabel(l.at, new Date(), zone) : l.when}</time>
              <span className="activity-store">{l.store}</span>
              <Link className="activity-text" href={l.href}>{l.text}</Link>
            </li>
          ))}
        </ol>
      )}
      <div className="activity-foot">Last two weeks · your time zone · changes matched to your work log are marked</div>
    </section>
  );
}

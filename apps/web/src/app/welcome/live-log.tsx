'use client';

import { useEffect, useRef, useState } from 'react';

export type LogLine = { store: string; text: string; tone: 'risk' | 'good' | 'plain' };

const VISIBLE = 7;
const fmt = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

/** The change log as a live feed: a new event lands every few seconds, newest on top.
 *  Static (the first lines, with fixed times) without JavaScript or with reduced motion. */
export function LiveLog({ lines, times }: { lines: LogLine[]; times: string[] }) {
  const [feed, setFeed] = useState(() => lines.slice(0, VISIBLE).map((l, i) => ({ ...l, when: times[i], id: i, fresh: false })).reverse());
  const [paused, setPaused] = useState(false);
  const counter = useRef({ next: VISIBLE, minute: 0 });

  useEffect(() => {
    if (paused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = counter.current;
    const t = setInterval(() => {
      const line = lines[c.next % lines.length];
      const id = c.next++;
      c.minute += 7 + (id % 5) * 3;
      const when = fmt(new Date(Date.UTC(2026, 10, 1, 18, 47 + c.minute)));
      setFeed((f) => [{ ...line, when, id, fresh: true }, ...f.map((x) => ({ ...x, fresh: false }))].slice(0, VISIBLE));
    }, 3200);
    return () => clearInterval(t);
  }, [paused, lines]);

  return (
    <div className="lp-feed-wrap" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="lp-feed-head">
        <span className="lp-live-dot" aria-hidden="true" />Watching 6 client stores
        <button type="button" className="lp-feed-pause" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>{paused ? 'Resume' : 'Pause'}</button>
      </div>
      <ol className="lp-feed" aria-label="Example change log" aria-live="off">
        {feed.map((l) => (
          <li key={l.id} className={`lp-feed-item lp-${l.tone}${l.fresh ? ' lp-fresh' : ''}`}>
            <time className="lp-feed-when">{l.when}</time>
            <span className="lp-feed-store">{l.store}</span>
            <span className="lp-feed-text">{l.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

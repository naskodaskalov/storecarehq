'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type KeyboardEvent } from 'react';
import type { TimelineDay } from '@/lib/month-timeline';
import { announceNavigation } from '@/components/navigation-progress';

/** One store's month, day by day, ending in the page the client reads. Arrow keys, tap, or play. */
export function MonthTimeline({
  days,
  storeId,
  month,
  label,
  prevHref,
  nextHref,
  monthParam,
}: {
  days: TimelineDay[];
  storeId: string;
  /** "October" */
  month: string;
  /** "October 2026" */
  label: string;
  prevHref: string;
  nextHref: string | null;
  /** "2026-10": kept on change links so the page comes back to this month. */
  monthParam: string;
}) {
  const past = days.filter((d) => !d.future);
  const lastIndex = Math.max(0, past.length - 1);
  // Open on today (the last day so far); an earlier month opens on its last day.
  const [sel, setSel] = useState(lastIndex);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(false); // a playback reached the end: offer a replay
  const strip = useRef<HTMLDivElement>(null);
  // Another month is a server round trip: keep this one on screen, dimmed, until the new one arrives.
  const router = useRouter();
  const [loading, startLoading] = useTransition();
  const [target, setTarget] = useState<'prev' | 'next' | null>(null);
  function openMonth(href: string, which: 'prev' | 'next') {
    setPlaying(false);
    setTarget(which);
    announceNavigation();
    startLoading(() => router.push(href, { scroll: false }));
  }
  const scores = past.map((d) => d.speed).filter((s): s is number => s !== null);
  const max = Math.max(...scores, 1);
  const min = Math.min(...scores, max);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setSel((s) => {
        if (s >= lastIndex) {
          setPlaying(false);
          setPlayed(true);
          return s;
        }
        return s + 1;
      });
    }, 650);
    return () => clearInterval(t);
  }, [playing, lastIndex]);

  function go(i: number, focus = false) {
    const n = Math.max(0, Math.min(lastIndex, i));
    setSel(n);
    if (focus) strip.current?.querySelectorAll<HTMLButtonElement>('button')[n]?.focus();
  }
  function onKey(e: KeyboardEvent) {
    const step = { ArrowRight: 1, ArrowLeft: -1, Home: -999, End: 999 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    setPlaying(false);
    go(sel + step, true);
  }
  function play() {
    if (playing) return setPlaying(false);
    if (sel >= lastIndex) setSel(0);
    setPlaying(true);
  }

  const d = days[sel];
  return (
    <div className={`tl-box${loading ? ' is-loading' : ''}`} aria-busy={loading}>
      <div className="tl-top">
        <div className="tl-months">
          <button type="button" onClick={() => openMonth(prevHref, 'prev')} disabled={loading} aria-label="Previous month">‹</button>
          <strong>{label}</strong>
          {nextHref ? (
            <button type="button" onClick={() => openMonth(nextHref, 'next')} disabled={loading} aria-label="Next month">›</button>
          ) : (
            <span aria-hidden="true" className="tl-month-off">›</span>
          )}
          {loading && (
            <span className="tl-loading" role="status">
              <span className="tl-spinner" aria-hidden="true" />Loading {target === 'next' ? 'next' : 'previous'} month…
            </span>
          )}
        </div>
        <button type="button" className="tl-play" onClick={play} aria-pressed={playing} disabled={past.length < 2 || loading}>
          {playing ? 'Pause' : played && sel >= lastIndex ? 'Replay the month' : 'Play the month'}
        </button>
      </div>

      <div className="tl-strip" ref={strip} role="radiogroup" aria-label={`Days of ${month}`} onKeyDown={onKey} style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((x, i) => {
          if (x.future) {
            return (
              <span key={x.day} className="tl-day tl-day-future" aria-hidden="true">
                <span className="tl-day-n">{x.day}</span>
              </span>
            );
          }
          const tone = x.events.some((e) => e.tone === 'risk') ? 'risk' : x.events.some((e) => e.tone === 'work') ? 'work' : x.events.length ? 'plain' : 'quiet';
          const h = x.speed === null ? 6 : 18 + ((x.speed - min) / Math.max(1, max - min)) * 46;
          return (
            <button
              key={x.day}
              type="button"
              role="radio"
              aria-checked={i === sel}
              tabIndex={i === sel ? 0 : -1}
              aria-label={`${month} ${x.day}${x.events.length ? `, ${x.events.length} event${x.events.length > 1 ? 's' : ''}` : ', nothing to report'}`}
              className={`tl-day tl-day-${tone}${i === sel ? ' on' : ''}${x.speed === null ? ' no-speed' : ''}`}
              onClick={() => {
                setPlaying(false);
                go(i);
              }}
            >
              <span className="tl-day-bar" style={{ height: `${h}px` }} />
              <span className="tl-day-dot" />
              <span className="tl-day-n">{x.day}</span>
            </button>
          );
        })}
      </div>
      <div className="tl-legend" aria-hidden="true">
        <span><i className="tl-k-bar" />Mobile speed score</span>
        <span><i className="tl-k-risk" />Flagged</span>
        <span><i className="tl-k-work" />Your work</span>
        <span><i className="tl-k-plain" />Change</span>
      </div>

      <div className="tl-day-detail" aria-live="polite">
        <div className="tl-date">
          <span>{d.weekday}</span>
          <strong>{d.day} {month}</strong>
          <small>{d.speed !== null ? `Speed ${d.speed}` : 'No speed reading'}</small>
        </div>
        <div className="tl-events">
          {d.events.length === 0 ? (
            <p className="tl-quiet">{d.quiet}</p>
          ) : (
            <ol>
              {d.events.map((e, n) => (
                <li key={n} className={`tl-ev tl-ev-${e.tone}`}>
                  <time>{e.time || '—'}</time>
                  <span>
                    {e.changeId !== undefined ? <Link href={`/stores/${storeId}?month=${monthParam}&change=${e.changeId}#change-details`}>{e.text}</Link> : e.text}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {d.report.length > 0 && (
            <div className="tl-report">
              <span>In the report</span>
              {d.report.map((line) => <p key={line}>{line}</p>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

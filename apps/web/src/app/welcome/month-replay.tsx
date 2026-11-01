'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export type ReplayEvent = {
  time: string;
  text: string;
  tone: 'risk' | 'good' | 'plain' | 'work';
};
export type ReplayDay = {
  day: number;
  speed: number;
  events: ReplayEvent[];
  /** Where this day shows up in the client's report. */
  report: string;
};

const WEEKDAY = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });

/** A month of one store, day by day, ending in the one page the client reads. Arrow keys, tap, or play. */
export function MonthReplay({ days, store, month, year, monthIndex }: { days: ReplayDay[]; store: string; month: string; year: number; monthIndex: number }) {
  const [sel, setSel] = useState(() => days.findIndex((d) => d.events.some((e) => e.tone === 'risk')));
  const [playing, setPlaying] = useState(false);
  const strip = useRef<HTMLDivElement>(null);
  const max = Math.max(...days.map((d) => d.speed));
  const min = Math.min(...days.map((d) => d.speed));

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setSel((s) => {
        if (s >= days.length - 1) { setPlaying(false); return s; }
        return s + 1;
      });
    }, 650);
    return () => clearInterval(t);
  }, [playing, days.length]);

  function go(i: number, focus = false) {
    const n = Math.max(0, Math.min(days.length - 1, i));
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
    if (sel >= days.length - 1) setSel(0);
    setPlaying(true);
  }

  const d = days[sel];
  const quiet = d.events.length === 0;
  return (
    <div className="lp-replay-box">
      <div className="lp-replay-top">
        <span><strong>{store}</strong> · {month} {year}</span>
        <button type="button" className="lp-replay-play" onClick={play} aria-pressed={playing}>
          {playing ? 'Pause' : sel >= days.length - 1 ? 'Replay the month' : 'Play the month'}
        </button>
      </div>

      <div className="lp-replay-strip" ref={strip} role="radiogroup" aria-label={`Days of ${month}`} onKeyDown={onKey}>
        {days.map((x, i) => {
          const tone = x.events.some((e) => e.tone === 'risk') ? 'risk' : x.events.some((e) => e.tone === 'work') ? 'work' : x.events.length ? 'plain' : 'quiet';
          const h = 18 + ((x.speed - min) / Math.max(1, max - min)) * 46;
          return (
            <button key={x.day} type="button" role="radio" aria-checked={i === sel} tabIndex={i === sel ? 0 : -1}
              aria-label={`${month} ${x.day}${x.events.length ? `, ${x.events.length} event${x.events.length > 1 ? 's' : ''}` : ', all checks passed'}`}
              className={`lp-day lp-day-${tone}${i === sel ? ' on' : ''}`} onClick={() => { setPlaying(false); go(i); }}>
              <span className="lp-day-bar" style={{ height: `${h}px` }} />
              <span className="lp-day-dot" />
              <span className="lp-day-n">{x.day}</span>
            </button>
          );
        })}
      </div>
      <div className="lp-replay-legend" aria-hidden="true">
        <span><i className="lp-k-bar" />Mobile speed score</span>
        <span><i className="lp-k-risk" />Flagged</span>
        <span><i className="lp-k-work" />Your work</span>
        <span><i className="lp-k-plain" />Change</span>
      </div>

      <div className="lp-replay-day" aria-live="polite">
        <div className="lp-replay-date">
          <span>{WEEKDAY(year, monthIndex, d.day)}</span>
          <strong>{d.day} {month}</strong>
          <small>Speed {d.speed}</small>
        </div>
        <div className="lp-replay-events">
          {quiet ? (
            <p className="lp-replay-quiet">A quiet day: 48 uptime checks passed, checkout passed on mobile and desktop. Quiet days are proof too.</p>
          ) : (
            <ol>
              {d.events.map((e) => (
                <li key={e.time + e.text} className={`lp-ev lp-ev-${e.tone}`}>
                  <time>{e.time}</time>
                  <span>{e.text}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="lp-replay-report"><span>In the report</span>{d.report}</p>
        </div>
      </div>
    </div>
  );
}

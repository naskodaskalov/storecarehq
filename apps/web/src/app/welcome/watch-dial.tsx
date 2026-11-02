'use client';

import { useEffect, useState } from 'react';

/** Which ring of the dial a check runs on: every 30 minutes, about hourly, or once each morning. */
type Ring = 'uptime' | 'storefront' | 'daily';

export type WatchCheck = {
  key: string;
  name: string;
  detail: string;
  ring: Ring;
  /** Minutes after midnight, for the once-a-morning checks: where its mark sits on the inner ring. They run after
   *  06:00 store time; the marks are spread across the early morning so each one can be seen and picked. */
  at?: number;
  /** A real catch from the sample stores, so the check reads as something that happens, not a feature. */
  caught: { when: string; text: string };
};

const C = 200;
const R = { uptime: 178, storefront: 150, daily: 122 } as const;
const RING_LABEL: Record<Ring, string> = { uptime: 'every 30 min', storefront: 'about hourly', daily: 'every morning, from 06:00' };

/** Point on the dial for a time of day (minutes after midnight), midnight at the top, clockwise. */
function at(minutes: number, r: number): [number, number] {
  const a = (minutes / 1440) * 2 * Math.PI - Math.PI / 2;
  // Rounded so the server's and the browser's trigonometry produce identical markup.
  return [Math.round((C + r * Math.cos(a)) * 100) / 100, Math.round((C + r * Math.sin(a)) * 100) / 100];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** How many of each check a store has had so far today, at this minute. */
function soFar(minute: number, dailyAt: number[]) {
  return {
    uptime: Math.floor(minute / 30) + 1,
    storefront: Math.floor(minute / 60) + 1,
    daily: dailyAt.filter((m) => m <= minute).length,
  };
}

/** One client store's day on a 24-hour dial: every check at its real cadence, a hand at the visitor's own time,
 *  and a running count of what has already run today. Pick a check to see its ring and something it caught.
 *  Without JavaScript the dial is drawn without the hand and the list still reads as plain text. */
export function WatchDial({ checks }: { checks: WatchCheck[] }) {
  const [minute, setMinute] = useState<number | null>(null);
  const [active, setActive] = useState(checks[0].key);
  const current = checks.find((c) => c.key === active) ?? checks[0];
  const dailyAt = checks.filter((c) => c.ring === 'daily').map((c) => c.at ?? 360);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setMinute(d.getHours() * 60 + d.getMinutes());
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);

  const done = minute === null ? null : soFar(minute, dailyAt);
  const total = done ? done.uptime + done.storefront + done.daily : null;
  const lit = (m: number) => minute !== null && m <= minute;
  const dim = (ring: Ring) => (current.ring === ring ? '' : ' is-quiet');

  return (
    <div className="lp-dial-wrap">
      <figure className="lp-dial">
        <svg viewBox="0 0 400 400" role="img" aria-labelledby="dial-desc">
          <desc id="dial-desc">
            A 24-hour dial for one client store: 48 uptime checks around the outside, a storefront snapshot every hour inside
            that, and the checkout, speed and renewals checks each morning after 06:00.
          </desc>
          <circle cx={C} cy={C} r={196} className="lp-dial-face" />
          {/* Outer ring: uptime, every 30 minutes */}
          <g className={`lp-ring lp-ring-uptime${dim('uptime')}`}>
            {Array.from({ length: 48 }, (_, i) => {
              const [x1, y1] = at(i * 30, R.uptime - 9);
              const [x2, y2] = at(i * 30, R.uptime + 9);
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={lit(i * 30) ? 'is-done' : ''} />;
            })}
          </g>
          {/* Middle ring: storefront snapshot (theme, apps, products and stock), about hourly */}
          <g className={`lp-ring lp-ring-storefront${dim('storefront')}`}>
            {Array.from({ length: 24 }, (_, i) => {
              const [x, y] = at(i * 60 + 15, R.storefront);
              return <circle key={i} cx={x} cy={y} r={5} className={lit(i * 60 + 15) ? 'is-done' : ''} />;
            })}
          </g>
          {/* Inner ring: the morning checks */}
          <g className={`lp-ring lp-ring-daily${dim('daily')}`}>
            <circle cx={C} cy={C} r={R.daily} className="lp-dial-track" />
            {checks
              .filter((c) => c.ring === 'daily')
              .map((c) => {
                const [x, y] = at(c.at ?? 360, R.daily);
                return <circle key={c.key} cx={x} cy={y} r={c.key === active ? 9 : 6.5} className={`${lit(c.at ?? 360) ? 'is-done' : ''}${c.key === active ? ' is-active' : ''}`} />;
              })}
          </g>
          {[0, 6, 12, 18].map((h) => {
            const [x, y] = at(h * 60, 96);
            return (
              <text key={h} x={x} y={y} className="lp-dial-hour" textAnchor="middle" dominantBaseline="central">
                {pad(h)}
              </text>
            );
          })}
          {minute !== null && (
            <g className="lp-dial-hand">
              <line x1={at(minute, 108)[0]} y1={at(minute, 108)[1]} x2={at(minute, 192)[0]} y2={at(minute, 192)[1]} />
              <circle cx={at(minute, 192)[0]} cy={at(minute, 192)[1]} r={4} />
            </g>
          )}
          <text x={C} y={C - 20} textAnchor="middle" className="lp-dial-big">
            {minute === null ? '1,488' : total}
          </text>
          <text x={C} y={C + 6} textAnchor="middle" className="lp-dial-small">
            {minute === null ? 'checks a month,' : 'checks already today,'}
          </text>
          <text x={C} y={C + 24} textAnchor="middle" className="lp-dial-small">
            {minute === null ? 'per store' : `per store, by ${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`}
          </text>
        </svg>
        <figcaption>
          {done ? (
            <>
              By now, your time: <b>{done.uptime}</b> uptime checks, <b>{done.storefront}</b> storefront snapshots and{' '}
              <b>{done.daily}</b> of 3 morning checks on every store you look after.
            </>
          ) : (
            <>Every store, every day: 48 uptime checks, 24 storefront snapshots and 3 morning checks.</>
          )}
        </figcaption>
      </figure>

      <div className="lp-dial-side">
        <ul className="lp-dial-list" aria-label="What it checks">
          {checks.map((c) => (
            <li key={c.key}>
              <button type="button" aria-pressed={c.key === active} className={`lp-dial-item lp-ring-${c.ring}`} onClick={() => setActive(c.key)} onMouseEnter={() => setActive(c.key)} onFocus={() => setActive(c.key)}>
                <span className="lp-dial-dot" aria-hidden="true" />
                <span className="lp-dial-name">{c.name}</span>
                <span className="lp-dial-when">{RING_LABEL[c.ring]}</span>
                <span className="lp-dial-detail">{c.detail}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="lp-dial-caught" aria-live="polite">
          <span className="lp-dial-caught-label">What it caught on the sample stores</span>
          <span className="lp-dial-caught-when">{current.caught.when}</span>
          <p>{current.caught.text}</p>
        </div>
      </div>
    </div>
  );
}

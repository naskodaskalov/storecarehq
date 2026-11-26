'use client';

// One section for the product's four views (change log, a month on one store, the checks, your own stores) instead
// of four sections in a row. Every panel is server-rendered and stays in the page for search engines and for state
// (a store list typed into one tab survives a switch); only the chosen one is shown. Tabs follow the WAI-ARIA
// pattern: arrow keys, Home and End move between them, and #<panel id> in the address opens that tab.

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { track } from '@/components/analytics';

export type TourTab = { id: string; label: string; hint: string; panel: ReactNode };

export function ProductTour({ tabs }: { tabs: TourTab[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  // Links like #book (the portfolio check) open their tab and scroll to the tour.
  useEffect(() => {
    const open = () => {
      const n = tabs.findIndex((t) => `#${t.id}` === location.hash);
      if (n < 0) return;
      setActive(n);
      document.getElementById('tour')?.scrollIntoView({ block: 'start' });
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, [tabs]);

  function choose(n: number, focus = false) {
    setActive(n);
    if (focus) refs.current[n]?.focus();
    track('tour_tab', { tab: tabs[n].id });
  }

  function onKey(e: KeyboardEvent, n: number) {
    const last = tabs.length - 1;
    const to = e.key === 'ArrowRight' ? (n === last ? 0 : n + 1) : e.key === 'ArrowLeft' ? (n === 0 ? last : n - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? last : -1;
    if (to < 0) return;
    e.preventDefault();
    choose(to, true);
  }

  return (
    <>
      <div className="lp-tour-tabs" role="tablist" aria-label="Product tour">
        {tabs.map((t, n) => (
          <button
            key={t.id}
            ref={(el) => { refs.current[n] = el; }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-controls={t.id}
            aria-selected={n === active}
            tabIndex={n === active ? 0 : -1}
            className="lp-tour-tab"
            onClick={() => choose(n)}
            onKeyDown={(e) => onKey(e, n)}
          >
            <span className="lp-tour-num" aria-hidden="true">{String(n + 1).padStart(2, '0')}</span>
            <span className="lp-tour-label">{t.label}</span>
            <span className="lp-tour-hint">{t.hint}</span>
          </button>
        ))}
      </div>
      {tabs.map((t, n) => (
        <div key={t.id} id={t.id} role="tabpanel" aria-labelledby={`tab-${t.id}`} hidden={n !== active} className="lp-tour-panel" tabIndex={0}>
          {t.panel}
        </div>
      ))}
    </>
  );
}

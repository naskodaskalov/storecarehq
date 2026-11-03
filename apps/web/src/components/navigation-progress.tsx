'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/** Components that change the page from code (router.push) announce it with this event, so the bar shows. */
export const NAVIGATION_START = 'storecare:navigation-start';
export function announceNavigation() {
  window.dispatchEvent(new Event(NAVIGATION_START));
}

const SHOW_AFTER_MS = 120; // a navigation that finishes sooner shows nothing, so instant pages don't flicker
const GIVE_UP_MS = 20_000; // never leave the bar running if a navigation is abandoned

/** The thin bar at the top of the window for every navigation: link clicks (including filters and other
 *  links that only change the query), back/forward, and announced router pushes. Hides when the new URL renders. */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [visible, setVisible] = useState(false);
  const timers = useRef<{ show?: number; stop?: number }>({});

  function clear() {
    window.clearTimeout(timers.current.show);
    window.clearTimeout(timers.current.stop);
  }
  function start() {
    clear();
    timers.current.show = window.setTimeout(() => setVisible(true), SHOW_AFTER_MS);
    timers.current.stop = window.setTimeout(() => setVisible(false), GIVE_UP_MS);
  }

  // The new URL has rendered: done.
  useEffect(() => {
    clear();
    setVisible(false);
  }, [pathname, search]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      // Runs in the capture phase, before Next's <Link> takes over the click (it cancels the default).
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const to = new URL(a.href, location.href);
      if (to.origin !== location.origin) return;
      // Same page and query: only a jump to an anchor, nothing loads.
      if (to.pathname === location.pathname && to.search === location.search) return;
      start();
    }
    window.addEventListener('click', onClick, true);
    window.addEventListener('popstate', start);
    window.addEventListener(NAVIGATION_START, start);
    return () => {
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', start);
      window.removeEventListener(NAVIGATION_START, start);
      clear();
    };
  }, []);

  return visible ? <div className="page-progress" role="progressbar" aria-label="Loading page" /> : null;
}

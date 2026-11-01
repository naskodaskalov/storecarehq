'use client';

import { useEffect, useState, type ReactNode } from 'react';

/** The site header stays at the top while the page scrolls. Once the page has moved, it gets a frosted
 *  background and a hairline so it reads as a bar above the content rather than part of it. */
export function StickyHeader({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 4);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return <header className={`lp-head${scrolled ? ' is-scrolled' : ''}`}>{children}</header>;
}

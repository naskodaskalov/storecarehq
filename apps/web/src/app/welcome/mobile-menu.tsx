'use client';

import { useRef, type ReactNode } from 'react';

/** The small-screen menu: a <details> that closes again when a link inside it is tapped. */
export function MobileMenu({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details className="lp-menu" ref={ref}>
      <summary aria-label="Menu"><span /><span /><span /></summary>
      <div className="lp-menu-panel" onClick={(e) => { if ((e.target as HTMLElement).closest('a')) ref.current?.removeAttribute('open'); }}>
        {children}
      </div>
    </details>
  );
}

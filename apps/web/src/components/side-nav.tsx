'use client';

import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/**
 * The workspace sidebar. On wider screens its content shows as a column; on phones it is a top bar with
 * the brand and a menu button, and the same content opens as a panel under the bar.
 * The panel closes on a link tap, on any new page (back/forward too), on Escape and on a tap outside it.
 */
export function SideNav({ label, brand, className, children }: { label: string; brand: ReactNode; className?: string; children: ReactNode }) {
  const path = usePathname();
  // Open only on the page it was opened on, so every navigation closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const toggle = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setOpenOn(null);
      toggle.current?.focus();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  function closeOnLinkTap(e: MouseEvent<HTMLDivElement>) {
    if ((e.target as Element).closest('a')) setOpenOn(null);
  }

  return (
    <nav className={className ? `nav ${className}` : 'nav'} aria-label={label}>
      <div className="nav-bar">
        {brand}
        <button ref={toggle} type="button" className="nav-toggle" aria-label="Menu" aria-expanded={open} aria-controls={panelId} onClick={() => setOpenOn(open ? null : path)}>
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      </div>
      {open && <div className="nav-backdrop" aria-hidden="true" onClick={() => setOpenOn(null)} />}
      <div id={panelId} className="nav-panel" data-open={open ? '' : undefined} onClick={closeOnLinkTap}>
        {children}
      </div>
    </nav>
  );
}

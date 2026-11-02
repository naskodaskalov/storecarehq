'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/icon';

/** The sidebar. On phones it collapses to a top bar with a Menu button that opens the links below it. */
export function NavShell({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);
  return (
    // Following any link closes the menu (also links to the page you are on, like "Stores").
    <nav className={`nav ${className}`.trim()} aria-label={label} data-open={open || undefined} onClick={(e) => { if ((e.target as Element).closest('a')) setOpen(false); }}>
      <button type="button" className="nav-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name={open ? 'close' : 'menu'} size={18} />{open ? 'Close' : 'Menu'}
      </button>
      {children}
    </nav>
  );
}

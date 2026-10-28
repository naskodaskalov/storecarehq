'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Dashboard', match: (p: string) => p === '/' },
  { href: '/stores', label: 'Stores', match: (p: string) => p.startsWith('/stores') },
  { href: '/work', label: 'Work log', match: (p: string) => p.startsWith('/work') },
  { href: '/reports', label: 'Reports', match: (p: string) => p.startsWith('/reports') },
  { href: '/billing', label: 'Billing', match: (p: string) => p.startsWith('/billing') },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <div className="nav-links">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.match(path) ? 'page' : undefined}>
          {l.label}
        </Link>
      ))}
    </div>
  );
}

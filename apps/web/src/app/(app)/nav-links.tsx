'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/icon';

const LINKS = [
  { href: '/', label: 'Overview', icon: 'home', match: (p: string) => p === '/' },
  { href: '/#client-stores', label: 'Stores', icon: 'store', match: (p: string) => p.startsWith('/stores') },
  { href: '/work', label: 'Work log', icon: 'work', match: (p: string) => p.startsWith('/work') },
  { href: '/reports', label: 'Reports', icon: 'report', match: (p: string) => p.startsWith('/reports') },
  { href: '/settings', label: 'Agency settings', icon: 'settings', match: (p: string) => p.startsWith('/settings') },
  { href: '/billing', label: 'Billing', icon: 'billing', match: (p: string) => p.startsWith('/billing') },
  { href: '/contact', label: 'Contact', icon: 'mail', match: (p: string) => p === '/contact' },
];

export function NavLinks({ isAdmin = false }: { isAdmin?: boolean }) {
  const path = usePathname();
  const links = isAdmin ? [...LINKS, { href: '/admin', label: 'Admin: quick report', icon: 'report', match: (p: string) => p.startsWith('/admin') }] : LINKS;
  return (
    <div className="nav-links">
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.match(path) ? 'page' : undefined}>
          <Icon name={l.icon as IconName} />{l.label}
        </Link>
      ))}
    </div>
  );
}

export function WorkspaceHeader() {
  const path = usePathname();
  const label = path.startsWith('/stores') ? 'Store details' : LINKS.find((l) => l.match(path))?.label ?? 'Workspace';
  return <header className="workspace-header"><div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-divider">/</span><strong>{label}</strong></div></header>;
}

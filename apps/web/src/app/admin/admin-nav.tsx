'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/icon';

export function AdminNav() {
  const path = usePathname();
  return <div className="nav-links">
    <Link href="/admin" aria-current={path === '/admin' ? 'page' : undefined}><Icon name="chart" />Overview</Link>
    <Link href="/admin/quick-report" aria-current={path.startsWith('/admin/quick-report') ? 'page' : undefined}><Icon name="search" />Quick report</Link>
    <Link href="/admin/outreach" aria-current={path.startsWith('/admin/outreach') ? 'page' : undefined}><Icon name="mail" />Agency outreach</Link>
  </div>;
}

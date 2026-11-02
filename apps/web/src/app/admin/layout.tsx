import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-session';

export const dynamic = 'force-dynamic';

// Admin pages sit outside the agency workspace: no plan or trial needed, and nothing they do touches a workspace.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { email } = await requireAdmin();
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <Link href="/" className="brand" style={{ color: 'inherit' }}><div className="mark">SC</div><span className="brand-name">StoreCare HQ</span></Link>
        <span className="admin-tag">Admin</span>
        <span className="small muted admin-email">{email}</span>
        <Link href="/" className="small">Back to workspace</Link>
      </header>
      <main className="admin-main" id="main-content">{children}</main>
    </div>
  );
}

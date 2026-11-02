import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-session';
import { Icon } from '@/components/icon';
import { AdminNav } from './admin-nav';

export const dynamic = 'force-dynamic';

// Admin pages sit outside the agency workspace: no plan or trial needed, and nothing they do touches a workspace.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { email } = await requireAdmin();
  return (
    <div className="shell admin-shell">
      <nav className="nav admin-nav no-print" aria-label="Administration">
        <Link href="/" className="brand"><div className="mark">SC</div><span className="brand-name">StoreCare HQ</span></Link>
        <div className="workspace-identity"><span className="nav-caption">Administration</span><div className="workspace-name">StoreCare HQ team</div></div>
        <AdminNav />
        <div className="nav-foot"><Link href="/" className="admin-back"><Icon name="home" size={17} />Back to workspace</Link><p className="muted">Internal tools for the StoreCare team.</p></div>
      </nav>
      <div className="workspace-body">
      <header className="workspace-header admin-header no-print">
        <div className="breadcrumb"><span>StoreCare HQ</span><span className="breadcrumb-divider">/</span><strong>Administration</strong></div>
        <span className="small muted admin-email">{email}</span>
      </header>
      <main className="admin-main" id="main-content">{children}</main>
      </div>
    </div>
  );
}

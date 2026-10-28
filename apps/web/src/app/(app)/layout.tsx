import type { ReactNode } from 'react';
import { requireAgency } from '@/lib/data';
import { supabaseServer } from '@/lib/supabase';
import { NavLinks } from './nav-links';
import { isDemo } from '@/lib/demo';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { agency } = await requireAgency();
  const supabase = await supabaseServer();
  const { count } = await supabase.from('stores').select('id', { count: 'exact', head: true }).eq('agency_id', agency.id);

  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <div className="brand"><div className="mark">SC</div><span className="brand-name">StoreCare HQ</span></div>
        <NavLinks />
        <div className="nav-foot">
          <div style={{ fontWeight: 600 }}>{agency.name}</div>
          <div className="small muted">
            {agency.plan === 'trial' ? 'Free trial' : `${agency.plan[0].toUpperCase()}${agency.plan.slice(1)} plan`} · {count ?? 0} stores
          </div>
        </div>
      </nav>
      <main className="main">
        {isDemo() && (
          <div className="small" style={{ background: 'var(--accent-soft)', borderRadius: 8, padding: '8px 14px' }}>
            <strong>Demo</strong> · Sample agency with made-up stores. Changes you make reset when the server restarts.
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

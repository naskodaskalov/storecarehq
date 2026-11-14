import Link from 'next/link';
import { requireAgency } from '@/lib/data';
import { supabaseServer } from '@/lib/supabase';
import { host } from '@/lib/format';
import { countdown, saleDates, shortDate } from '@/lib/bfcm';
import { BfcmBoard, type BoardAudit, type BoardStore } from './bfcm-board';

export const metadata = { title: 'BFCM audit · StoreCare HQ' };

export default async function BfcmPage({ searchParams }: { searchParams: Promise<{ run?: string; welcome?: string }> }) {
  const { run, welcome } = await searchParams;
  const { agency } = await requireAgency();
  const supabase = await supabaseServer();
  const [{ data: stores }, { data: audits }] = await Promise.all([
    supabase.from('stores').select('id, name, public_url, status').eq('agency_id', agency.id).order('name'),
    supabase.from('store_audits').select('id, store_id, created_at, verdict, fixes, looks, shared_at, sent_at').eq('agency_id', agency.id).order('created_at', { ascending: false }).limit(500),
  ]);
  const latest = new Map<string, BoardAudit>();
  for (const a of audits ?? []) if (!latest.has(a.store_id)) latest.set(a.store_id, a as BoardAudit);
  const rows: BoardStore[] = (stores ?? []).map((s) => ({ id: s.id, name: s.name, host: host(s.public_url), paused: s.status === 'paused', limited: s.status === 'limited', audit: latest.get(s.id) ?? null }));
  const sale = saleDates();

  return (
    <div className="workspace-page bfcm-page">
      <header className="page-heading">
        <div>
          <h1>Black Friday readiness</h1>
          <p><strong>{countdown()}</strong> · Black Friday {shortDate(sale.blackFriday)}, Cyber Monday {shortDate(sale.cyberMonday)}. One page per store, in your branding, ready to send to the client.</p>
        </div>
      </header>
      {welcome && rows.length > 0 && (
        // The last onboarding step for agencies that came from "Check all your client stores" on an outreach link.
        <section className="workspace-section bfcm-welcome" aria-label="Welcome">
          <div>
            <h2>You’re set up</h2>
            <p className="muted" style={{ margin: '6px 0 0' }}>
              {rows.length === 1 ? `${rows[0].name}’s` : 'Your new store’s'} first health check takes a few minutes; its Black Friday check runs as soon as that finishes.
              Meanwhile, add your other client stores: each gets its own one-page result in your branding.
            </p>
          </div>
          <div className="bfcm-welcome-actions">
            <Link className="btn" href="/onboarding/store">Add another store</Link>
            <Link className="btn secondary" href="/settings">Add your logo and colour</Link>
          </div>
        </section>
      )}
      {rows.length ? (
        <BfcmBoard stores={rows} autoStart={run === 'all'} />
      ) : (
        <section className="workspace-section">
          <h2>Add your first store</h2>
          <p className="muted" style={{ margin: 0 }}>The audit checks each client store you monitor.</p>
          <Link className="btn" href="/onboarding/store" style={{ alignSelf: 'flex-start' }}>Add store</Link>
        </section>
      )}
      <p className="small muted" style={{ margin: 0 }}>
        Checks: open to shoppers (password page, Shopify’s “Store unavailable”), Google can list it (noindex, robots.txt), the daily test checkout, uptime, mobile speed,
        stock on the products the home page promotes, broken links, certificate and domain renewals, app weight and recent theme or app changes.
        Missing or old data shows as “not checked”, never as a problem.
      </p>
    </div>
  );
}

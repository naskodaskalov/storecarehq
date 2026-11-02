import { QuickReportForm } from './quick-report-form';
import Link from 'next/link';

export const metadata = { title: 'Quick report · StoreCare HQ admin' };
// Storefront, SSL, domain, link and PageSpeed checks together take up to about a minute.
export const maxDuration = 60;
// Always render per request: the admin check reads the session.
export const dynamic = 'force-dynamic';

export default function AdminPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="page-heading">
        <div>
          <h1>Quick report</h1>
          <p>Check any Shopify store from the outside without adding it to a workspace. Nothing is saved.</p>
        </div>
      </div>
      <QuickReportForm />
      <Link href="/admin/outreach" className="btn secondary">Prepare agency outreach →</Link>
    </div>
  );
}

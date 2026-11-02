import { QuickReportForm } from './quick-report-form';
import Link from 'next/link';
import { Icon } from '@/components/icon';
import './quick-report.css';

export const metadata = { title: 'Quick report · StoreCare HQ admin' };
// Storefront, SSL, domain, link and PageSpeed checks together take up to about a minute.
export const maxDuration = 60;
// Always render per request: the admin check reads the session.
export const dynamic = 'force-dynamic';

export default function QuickReportPage() {
  return (
    <div className="quick-report-page">
      <div className="page-heading quick-page-heading no-print">
        <div>
          <p className="quick-eyebrow">STOREFRONT HEALTH</p>
          <h1>Quick report</h1>
          <p>A closer look at any Shopify store. One URL, no installation.</p>
        </div>
        <Link href="/admin/outreach" className="btn secondary"><Icon name="mail" size={16} />Agency outreach<Icon name="arrow" size={15} /></Link>
      </div>
      <QuickReportForm />
    </div>
  );
}

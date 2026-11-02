import Link from 'next/link';
import { OutreachForm } from './outreach-form';
import { requireAdmin } from '@/lib/admin-session';
import { testDeliveryConfig } from '@/lib/outreach-delivery';
import './outreach.css';

export const metadata = { title: 'Agency outreach · StoreCare HQ admin', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export default async function OutreachPage() {
  const { email } = await requireAdmin();
  const config = testDeliveryConfig(email);
  const sender = { from: config.from, to: config.adminEmail, ready: !config.demo && !!config.apiKey, storageReady: config.demo || !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    reason: config.demo ? 'Demo mode previews only. Sign in to send a test to your own address.' : 'Configure RESEND_API_KEY and a verified OUTREACH_FROM sender to enable test delivery.' };
  return <div className="outreach">
    <header className="outreach-intro no-print">
      <Link href="/admin">← Quick report</Link>
      <p className="small muted">ADMIN / GROWTH</p>
      <h1>Start a useful conversation.</h1>
      <p>Prepare a real store health check, an illustrative monthly report, and a personal introduction for each agency.</p>
    </header>
    <OutreachForm sender={sender} />
  </div>;
}

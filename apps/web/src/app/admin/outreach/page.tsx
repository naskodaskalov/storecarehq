import { Icon } from '@/components/icon';
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
      <div><p className="outreach-eyebrow">RELATIONSHIPS START HERE</p>
      <h1>Agency outreach</h1>
      <p>A useful report. A personal introduction. Your next agency customer.</p></div>
      <span className="outreach-mode"><Icon name="mail" size={15} />Test delivery</span>
    </header>
    <OutreachForm sender={sender} />
  </div>;
}

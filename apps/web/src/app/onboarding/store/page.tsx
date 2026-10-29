import Link from 'next/link';
import { redirect } from 'next/navigation';
import { billingState } from '@/lib/billing';
import { requireAgency } from '@/lib/data';
import { OnboardingFrame } from '../steps';
import { AddStoreForm } from './add-store-form';

export default async function Step2({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { agency } = await requireAgency();
  if (!billingState(agency).hasAccess) redirect('/onboarding/trial');
  return (
    <OnboardingFrame step={3}>
      <section className="onb-card">
        <div>
          <h1>Meet your first client store.</h1>
          <p className="setup-description">
            Paste a Shopify storefront address. We’ll check what’s visible before you add it.
          </p>
        </div>
        <AddStoreForm error={error} />
        <div className="panel setup-monitoring">
          <strong style={{ fontSize: 15 }}>A little visibility goes a long way.</strong>
          <div className="small" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '8px 20px', color: 'var(--text-2)' }}>
            <div>✓ Theme publishes & detected apps</div>
            <div>✓ Product & price changes</div>
            <div>✓ Uptime, speed & optional checkout tests</div>
            <div>✓ Public pages only, no customer data</div>
          </div>
        </div>
        <div className="row" style={{ borderTop: '1px solid var(--rule)', paddingTop: 8 }}>
          <Link href="/">← Back to workspace</Link>
          <Link href="/" className="muted">Skip for now</Link>
        </div>
      </section>
    </OnboardingFrame>
  );
}

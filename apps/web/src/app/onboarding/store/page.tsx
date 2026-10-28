import Link from 'next/link';
import { redirect } from 'next/navigation';
import { billingState } from '@/lib/billing';
import { requireAgency } from '@/lib/data';
import { OnboardingTop } from '../steps';
import { AddStoreForm } from './add-store-form';

export default async function Step2({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { agency } = await requireAgency();
  if (!billingState(agency).hasAccess) redirect('/onboarding/trial');
  return (
    <div className="onb">
      <OnboardingTop step={3} />
      <section className="onb-card">
        <div>
          <h1 style={{ fontSize: 30 }}>Add your first client store</h1>
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 16 }}>
            Paste the store&apos;s web address. No app to install and nothing for your client to approve.
          </p>
        </div>
        <AddStoreForm error={error} />
        <div className="panel">
          <strong style={{ fontSize: 15 }}>What StoreCare checks, from the public storefront</strong>
          <div className="small" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '8px 20px', color: 'var(--text-2)' }}>
            <div>Theme publishes, apps added or removed</div>
            <div>Product and price changes, to flag risky bulk edits</div>
            <div>Daily checkout test, uptime and speed</div>
            <div>Nothing behind a login, no customer data</div>
          </div>
        </div>
        <div className="row" style={{ borderTop: '1px solid var(--rule)', paddingTop: 8 }}>
          <Link href="/onboarding">Back</Link>
          <Link href="/" className="muted">Skip for now</Link>
        </div>
      </section>
    </div>
  );
}

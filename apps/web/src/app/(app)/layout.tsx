import type { ReactNode } from 'react';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { billingState, PLANS } from '@/lib/billing';
import { requireAgency } from '@/lib/data';
import { supabaseServer } from '@/lib/supabase';
import { NavLinks, WorkspaceHeader } from './nav-links';
import { signOut } from '@/app/auth/actions';
import { SubmitButton } from '@/components/submit-button';
import { Icon } from '@/components/icon';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { agency } = await requireAgency();
  const supabase = await supabaseServer();
  const { count } = await supabase.from('stores').select('id', { count: 'exact', head: true }).eq('agency_id', agency.id);
  const billing = billingState(agency);
  const path = (await headers()).get('x-pathname') ?? '';
  const onBilling = path.startsWith('/billing');
  // Trial over and no plan: everything but billing waits until they choose one. Data is kept.
  // A new agency that never finished checkout goes back to the sign-up trial step.
  if (!billing.hasAccess && !onBilling) redirect(agency.stripe_subscription_id || agency.trial_ends_at ? '/billing' : '/onboarding/trial');
  const planLabel = billing.plan ? `${PLANS[billing.plan].name} plan${billing.cardOnFile ? ', trial' : ''}` : billing.onTrial ? 'Free trial' : 'No plan';

  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <Link href="/" className="brand"><div className="mark">SC</div><span className="brand-name">StoreCare HQ</span></Link>
        <div className="workspace-identity"><span className="nav-caption">Workspace</span><div className="workspace-name">{agency.name}</div></div>
        <NavLinks />
        <div className="nav-foot">
          <div className="nav-account"><span className="account-avatar">{agency.name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span><div style={{ fontWeight: 600 }}>{agency.name}</div></div>
          <div className="small muted">
            {planLabel} · {count ?? 0} stores
          </div>
        </div>
        <form action={signOut} className="signout-form"><SubmitButton secondary pendingText="Signing out…"><Icon name="logout" size={17} />Sign out</SubmitButton></form>
      </nav>
      <div className="workspace-body">
      <WorkspaceHeader />
      <main className="main" id="main-content">
        {!onBilling && billing.onTrial && billing.cardOnFile && billing.plan && (
          <div className="trial-bar" role="status">
            <span>
              Free trial: <strong>{billing.trialDaysLeft} day{billing.trialDaysLeft === 1 ? '' : 's'} left</strong>. Your {PLANS[billing.plan].name} plan
              {billing.endsAt ? ' is cancelled and ends with the trial.' : ` starts on ${new Date(billing.trialEndsAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} at $${PLANS[billing.plan].usd} a month.`}
            </span>
            <Link href="/billing">Manage plan</Link>
          </div>
        )}
        {!onBilling && billing.onTrial && !billing.cardOnFile && (
          <div className={`trial-bar${billing.trialDaysLeft <= 2 ? ' warn-bar' : ''}`} role="status">
            <span>
              Free trial: <strong>{billing.trialDaysLeft} day{billing.trialDaysLeft === 1 ? '' : 's'} left</strong>. Choose a plan to keep monitoring after that.
            </span>
            <Link href="/billing">Choose a plan</Link>
          </div>
        )}
        {!onBilling && billing.pastDue && (
          <div className="trial-bar warn-bar" role="alert">
            <span>Your last payment failed. Update your card so monitoring keeps running.</span>
            <Link href="/billing">Update card</Link>
          </div>
        )}
        {children}
      </main>
      </div>
    </div>
  );
}

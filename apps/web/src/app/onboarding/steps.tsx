import type { ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icon';

const STEPS = [
  { label: 'Your workspace', description: 'Give your agency a home.' },
  { label: 'Choose a plan', description: 'Room for your client portfolio.' },
  { label: 'Connect a store', description: 'Start with a storefront URL.' },
  { label: 'Set up care', description: 'Hours, checks, and alerts.' },
];

const GUIDANCE = [
  ['A home for your agency.', 'Bring your stores, work, and client reports together in one workspace.'],
  ['Every feature. Your scale.', 'Choose the number of stores you need. Every plan includes the same tools.'],
  ['One URL. A clearer picture.', 'Monitor the public storefront without installing a Shopify app.'],
  ['Make care your own.', 'Connect the monitoring to the work your agency does for this client.'],
];

export function OnboardingFrame({ step, children }: { step: 1 | 2 | 3 | 4; children: ReactNode }) {
  return <div className="setup-shell">
    <header className="setup-header"><Link href="/welcome" className="brand"><span className="mark">SC</span>StoreCare HQ</Link><div><Link href="/">Back to workspace <Icon name="arrow" size={15} /></Link><span className="demo-badge">DEMO</span></div></header>
    <div className="setup-layout"><aside className="setup-rail"><span className="setup-kicker">LET’S GET YOU SET UP</span><h2>Your agency.<br /><span>Ready for more.</span></h2><OnboardingTop step={step} /><div className="setup-guidance"><Icon name={step === 1 ? 'home' : step === 2 ? 'billing' : step === 3 ? 'store' : 'clock'} size={24} /><strong>{GUIDANCE[step - 1][0]}</strong><p>{GUIDANCE[step - 1][1]}</p></div></aside>
      <main className={`setup-content${step === 2 ? ' setup-content-wide' : ''}`}><div className="setup-step-label">STEP {String(step).padStart(2, '0')} <span>OF 04</span></div>{children}<footer className="setup-footer"><Icon name="check" size={14} />{step === 3 ? 'Public storefront only. No Shopify installation required.' : 'Built for the teams behind the stores.'}</footer></main>
    </div>
  </div>;
}

export function OnboardingTop({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
      <ol className="setup-steps" aria-label="Setup steps">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const cls = n < step ? 'done' : n === step ? 'now' : '';
          return (
            <li key={s.label} className={cls} aria-current={n === step ? 'step' : undefined}>
              <span className="setup-step-number">{n < step ? <Icon name="check" size={16} /> : String(n).padStart(2, '0')}</span><div><strong>{s.label}</strong><span>{s.description}</span></div>
            </li>
          );
        })}
      </ol>
  );
}

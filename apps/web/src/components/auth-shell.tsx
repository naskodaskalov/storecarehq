import type { ReactNode } from 'react';
import { Icon } from './icon';
import { headers } from 'next/headers';
import { websiteLink } from '@/lib/domains';

export async function AuthShell({ children }: { children: ReactNode }) {
  const home = websiteLink((await headers()).get('host') ?? '');
  return (
    <main className="login-shell">
      <aside className="login-story" aria-label="About StoreCare HQ">
        <a href={home} className="brand"><span className="mark">SC</span>StoreCare HQ</a>
        <div className="login-story-content">
          <span className="login-eyebrow">BUILT FOR SHOPIFY AGENCIES</span>
          <h2>Great care.<br /><span>Clearly shown.</span></h2>
          <p>Keep an eye on every storefront.<br />Show clients the value behind your work.</p>
          <div className="login-preview" aria-label="Illustration of storefront monitoring">
            <div className="login-preview-heading"><span><span className="login-live-dot" />Your stores, in good hands</span><span>Store overview</span></div>
            {[['JA', 'Juniper & Ash', '94'], ['BB', 'Bloom Botanics', '96'], ['KK', 'Kite & Kin', '97']].map(([initials, name, score], index) => <div className="login-preview-row" key={name}><span className={`store-avatar avatar-${index}`}>{initials}</span><strong>{name}</strong><span className="login-preview-status"><Icon name="check" size={13} />{score} Healthy</span></div>)}
            <div className="login-preview-report"><span className="login-report-icon"><Icon name="report" size={20} /></span><div><strong>A month of care, made visible.</strong><span>Your branded report is ready to review.</span></div><Icon name="arrow" size={18} /></div>
          </div>
          <div className="login-story-features"><span><Icon name="check" size={14} />Storefront monitoring</span><span><Icon name="check" size={14} />Client-ready reports</span></div>
        </div>
        <div className="login-story-footer">Behind every thriving store is a team that cares.</div>
      </aside>
      <section className="login-entry" aria-labelledby="login-title">
        <header className="login-entry-top"><a href={home}>← Back to StoreCare</a><span className="demo-badge">DEMO</span></header>
        <div className="login-form-content">
          {children}
        </div>
        <footer className="login-entry-footer"><span>StoreCare HQ</span><span>Made for the teams behind the stores.</span></footer>
      </section>
    </main>
  );
}

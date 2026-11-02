// Shared frame for the public policy pages: privacy, terms, data processing and the bot page.

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { headers } from 'next/headers';
import { WEBSITE_ORIGIN, websiteLink } from '@/lib/domains';
import { Analytics, CookieSettingsLink } from '@/components/analytics';
import './legal.css';

/** Title, description, canonical address and share preview for a policy page on the website host. */
export function legalMetadata(path: string, title: string, description: string): Metadata {
  return {
    metadataBase: new URL(WEBSITE_ORIGIN),
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', url: path, siteName: 'StoreCare HQ', title, description, locale: 'en_US' },
  };
}

export const LEGAL_UPDATED = '2 November 2026';

const PAGES = [
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/dpa', label: 'Data processing' },
  { href: '/bot', label: 'StoreCareBot' },
];

export async function LegalPage({ title, intro, children, path }: { title: string; intro: ReactNode; children: ReactNode; path: string }) {
  const home = websiteLink((await headers()).get('host') ?? '');
  const contact = `${home === '/welcome' ? '/welcome' : home}#contact`;
  return (
    <div className="legal">
      <header className="legal-top">
        <Link href={home} className="legal-brand"><span className="mark">SC</span>StoreCare HQ</Link>
        <nav aria-label="Policies">
          {PAGES.map((p) => <Link key={p.href} href={p.href} aria-current={p.href === path ? 'page' : undefined}>{p.label}</Link>)}
        </nav>
      </header>
      <main className="legal-main">
        <p className="legal-updated">Last updated {LEGAL_UPDATED}</p>
        <h1>{title}</h1>
        <div className="legal-intro">{intro}</div>
        <div className="legal-body">{children}</div>
        <p className="legal-contact">Questions about this page? <a href={contact}>Write to us</a>; a person reads every message.</p>
      </main>
      <footer className="legal-foot">
        <span>© 2026 StoreCare HQ</span>
        <span>Not affiliated with Shopify.</span>
        <Link href={home}>Back to the website</Link>
        <CookieSettingsLink />
      </footer>
      <Analytics />
    </div>
  );
}

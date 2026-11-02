// Free tool page: "what Shopify theme is this store using?". Built for search: one clear tool at the top,
// then a plain explanation of how detection works and what the result means.

import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { appLink, WEBSITE_ORIGIN } from '@/lib/domains';
import { Analytics, CookieSettingsLink } from '@/components/analytics';
import { StickyHeader } from '../../welcome/sticky-header';
import { ThemeDetector } from './theme-detector';
import '../../welcome/landing.css';
import '../tools.css';

const PATH = '/tools/shopify-theme-detector';
const TITLE = 'Shopify Theme Detector: find the theme any store uses (free)';
const DESCRIPTION =
  'Paste any Shopify store address and see which theme it runs, the version, whether it came from the Shopify Theme Store, and which apps load on the page. Free, no sign-up.';

export const metadata: Metadata = {
  metadataBase: new URL(WEBSITE_ORIGIN),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: { type: 'website', url: PATH, siteName: 'StoreCare HQ', title: 'Shopify Theme Detector', description: DESCRIPTION, locale: 'en_US' },
  twitter: { card: 'summary', title: 'Shopify Theme Detector', description: DESCRIPTION },
};

const FAQ = [
  {
    q: 'How do you know which theme a Shopify store uses?',
    a: 'Every Shopify storefront that runs on a theme includes a small block of settings in its page code. It names the theme, the theme it was built from, the version and, for Theme Store themes, an ID. We read that block from the public home page, the same page any visitor loads.',
  },
  {
    q: 'Why does the store’s theme have a different name?',
    a: 'Merchants and agencies often duplicate a theme and rename the copy, for example “Dawn – Summer launch”. We show the theme it was built from as the main result and the store’s own name for its copy underneath.',
  },
  {
    q: 'Why can’t you find a theme on some stores?',
    a: 'Headless stores, built with Shopify Hydrogen or another framework, don’t use a Shopify theme. Some stores also block automated visits with a firewall, and password-protected stores only show their password page.',
  },
  {
    q: 'Is it free? Do I need an account?',
    a: 'Yes, it is free and needs no account. There is a limit of a few checks every ten minutes per visitor to keep the tool fast for everyone.',
  },
  {
    q: 'Do you store the stores I check?',
    a: 'No. We read the store’s public pages once, return the result, and don’t keep it.',
  },
  {
    q: 'Can I get told when a store changes its theme?',
    a: 'Yes, with StoreCare HQ. It checks client stores every day and tells you when the published theme, its version or the apps on the page change, then puts it all in a monthly report for your client.',
  },
];

function structuredData() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Shopify Theme Detector',
      url: `${WEBSITE_ORIGIN}${PATH}`,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Any',
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      publisher: { '@type': 'Organization', name: 'StoreCare HQ', url: WEBSITE_ORIGIN },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'StoreCare HQ', item: `${WEBSITE_ORIGIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Shopify Theme Detector', item: `${WEBSITE_ORIGIN}${PATH}` },
      ],
    },
  ];
}

export default async function ThemeDetectorPage() {
  const host = (await headers()).get('host') ?? '';
  const signup = appLink(host, '/login?trial=1');
  const login = appLink(host, '/login');
  return (
    <div className="lp td-page">
      <script
        type="application/ld+json"
        // Our own constants, serialised; "<" is escaped so no text in them can close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()).replace(/</g, '\\u003c') }}
      />
      <StickyHeader>
        <div className="lp-top">
          <Link href="/" className="lp-brand" aria-label="StoreCare HQ home">
            <span className="mark">SC</span>
            StoreCare HQ
          </Link>
          <nav className="lp-nav" aria-label="Main">
            <a href={signup} className="btn lp-btn-small">Start free trial</a>
          </nav>
        </div>
      </StickyHeader>

      <main className="td-main">
        <nav className="td-crumbs" aria-label="Breadcrumb"><Link href="/">StoreCare HQ</Link><span aria-hidden="true">/</span><span>Free tools</span></nav>
        <header className="td-hero">
          <p className="lp-eyebrow">Free tool</p>
          <h1>Shopify Theme Detector</h1>
          <p className="td-lede">Find out which theme any Shopify store is using, which version it runs and whether it came from the Shopify Theme Store. You also see the apps that load on the page.</p>
        </header>

        <ThemeDetector signup={signup} />

        <article className="td-article">
          <h2>How the theme detector works</h2>
          <p>
            A Shopify theme controls how a store looks: its layout, product pages, cart and fonts. When a store runs on a theme, Shopify
            adds a short block of settings to every page it serves. That block says which theme is published, what the theme was
            originally called, its version number and, for themes from the Shopify Theme Store, the theme’s ID.
          </p>
          <p>
            The detector loads the store’s public home page once, the way a shopper’s browser would, reads that block and shows you
            the result. It doesn’t log in, doesn’t need an app and follows the store’s robots.txt rules.
          </p>

          <h2>Reading the result</h2>
          <ul>
            <li><strong>Live theme</strong> is the theme the store was built from, such as Dawn, Impulse or Prestige, with its version when the theme publishes one.</li>
            <li><strong>The store’s own name</strong> appears when the copy was renamed, which is common: agencies duplicate a theme before every big change so they can roll back.</li>
            <li><strong>Theme Store or custom</strong> tells you whether the theme is linked to the Shopify Theme Store. A theme with no Theme Store link is usually a custom build, or a premium theme bought and installed from the developer’s own site.</li>
            <li><strong>Apps and services</strong> are the scripts that load on the page: reviews, email pop-ups, chat, analytics and so on. Apps that only work in the admin or at checkout don’t show up.</li>
          </ul>

          <h2>Why agencies check a store’s theme</h2>
          <p>
            Before quoting on a Shopify project, knowing the theme and version tells you a lot. An older version of a theme can mean
            missed bug fixes and slower pages. A heavily renamed or custom theme can mean more work for every change. And a long list
            of apps on the storefront is often where speed problems start.
          </p>
          <p>
            For stores you already look after, the theme matters after launch too. A client or one of their apps can publish a
            different theme, or an update can change how the cart behaves, and nobody notices until sales drop.
          </p>

          <h2>Keep watching the stores you look after</h2>
          <p>
            StoreCare HQ checks your clients’ Shopify stores every day: uptime, a daily checkout test, speed, theme and app changes,
            broken links, and SSL and domain expiry. When something changes you get one line saying what happened, and at the end of
            the month a branded report your client actually reads. No store access needed.
          </p>
          <p><a href={signup} className="btn lp-btn-big">Start your 7-day free trial</a></p>

          <h2>Frequently asked questions</h2>
          <div className="td-faq">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </article>
      </main>

      <footer className="lp-foot">
        <span>© 2026 StoreCare HQ</span>
        <span>Not affiliated with Shopify.</span>
        <a href="/">Home</a>
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
        <a href={login}>Sign in</a>
        <CookieSettingsLink />
      </footer>
      <Analytics />
    </div>
  );
}

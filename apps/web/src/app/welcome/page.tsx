// Public landing page. Signed-out visitors to "/" see this (middleware rewrites); the app lives behind sign-in.

import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { appLink, WEBSITE_ORIGIN } from '@/lib/domains';
import { buildFacts, DEFAULT_SECTIONS, monthPeriod, templateSummary, type MonthData } from '@storecare/reports';
import { ContactForm } from '@/components/contact-form';
import { StoreScan } from './store-scan';
import { BrandReport } from './brand-report';
import { LiveLog, type LogLine } from './live-log';
import { ValueCalculator } from './value-calculator';
import { MobileMenu } from './mobile-menu';
import { BrandProvider } from './brand-context';
import { SampleReportLink } from './sample-report-link';
import { PortfolioCheck } from './portfolio-check';
import { StickyCta } from './sticky-cta';
import { MonthReplay, type ReplayDay, type ReplayEvent } from './month-replay';
import './landing.css';

const TITLE = 'StoreCare HQ: monitoring and monthly reports for Shopify care plans';
const DESCRIPTION =
  'StoreCare HQ watches your clients’ Shopify stores every day (uptime, checkout, speed, apps and theme changes) and drafts the monthly report you send them. No store access needed. 7 days free.';

export const metadata: Metadata = {
  metadataBase: new URL(WEBSITE_ORIGIN),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'StoreCare HQ',
    title: 'Know what changed on every client store before your client does.',
    description: 'Monitoring and white-label monthly reports for Shopify care plans. Check any store free, no sign-up.',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Know what changed on every client store before your client does.',
    description: 'Monitoring and white-label monthly reports for Shopify care plans. Check any store free, no sign-up.',
  },
};

const PLANS = [
  { name: 'Solo', price: 29, stores: 5, note: 'For freelancers with a handful of care clients.' },
  { name: 'Agency', price: 79, stores: 20, note: 'For studios running care plans as a service line.' },
  { name: 'Pro', price: 149, stores: 50, note: 'For agencies with a full maintenance book.' },
];

// What the change log shows, in the product's own words. The first seven are the opening state; the rest tick in live.
const LOG: LogLine[] = [
  { store: 'Ferro Coffee', text: 'Checkout test failed on mobile: stuck at the shipping step', tone: 'risk' },
  { store: 'Ferro Coffee', text: 'Checkout test passed again, fixed in 29 min', tone: 'good' },
  { store: 'Juniper & Ash', text: 'New live theme: “Dawn – Autumn”, matched to your work log', tone: 'plain' },
  { store: 'Bloom Botanics', text: 'Prices changed on 42 products, not in your work log', tone: 'risk' },
  { store: 'Kite & Kin', text: 'Smile.io added to the storefront', tone: 'plain' },
  { store: 'Saltgrass Swim', text: 'Out of stock: Coastline One-Piece, all sizes', tone: 'plain' },
  { store: 'Ferro Coffee', text: 'Domain ferrocoffee.co expires in 14 days', tone: 'risk' },
  { store: 'Oak & Ember', text: 'Mobile speed score dropped from 71 to 52 after a new hero video', tone: 'risk' },
  { store: 'Juniper & Ash', text: 'Klaviyo pop-up removed, matched to your work log', tone: 'good' },
  { store: 'Saltgrass Swim', text: 'Store unreachable for 4 min (503), back up', tone: 'risk' },
  { store: 'Kite & Kin', text: '12 new products in “Winter Knits”', tone: 'plain' },
  { store: 'Bloom Botanics', text: 'SSL certificate renewed, valid until February', tone: 'good' },
  { store: 'Oak & Ember', text: 'Unknown script added: cdn.trackify.io', tone: 'risk' },
  { store: 'Ferro Coffee', text: 'Checkout test passed on mobile and desktop', tone: 'good' },
];
const LOG_TIMES = ['06:02', '06:31', '09:14', '11:40', '13:05', '15:22', '18:47'];

// October on the sample store, day by day: the same month the hero report is drafted from.
const REPLAY_EVENTS: Record<number, { events: ReplayEvent[]; report: string }> = {
  2: {
    events: [
      { time: '09:14', text: 'New live theme published: “Dawn – Autumn”', tone: 'plain' },
      { time: '09:20', text: 'Matched to your work log: Autumn theme, 2 h 30 min', tone: 'work' },
    ],
    report: 'Work done: “Launched the autumn homepage and collections.” Counted against the plan’s 10 hours.',
  },
  14: {
    events: [
      { time: '06:02', text: 'Checkout test failed on mobile: stuck at the shipping step', tone: 'risk' },
      { time: '06:04', text: 'Alert sent to Slack and email after the second failed run', tone: 'risk' },
      { time: '06:31', text: 'Checkout test passed again, down for 29 min', tone: 'good' },
      { time: '06:40', text: 'You logged: Checkout fix, 45 min', tone: 'work' },
    ],
    report: 'Incidents: checkout was down 29 minutes on 14 October, “a shipping app update; rolled back.” Fixed before most shoppers woke up.',
  },
  17: {
    events: [{ time: '13:05', text: 'Smile.io added to the storefront, not in your work log', tone: 'risk' }],
    report: 'Flagged for you, not the client: an app the client added themselves. You decide whether it goes in the report.',
  },
  22: {
    events: [
      { time: '11:10', text: 'Two apps removed from the storefront', tone: 'plain' },
      { time: '11:30', text: 'You logged: Speed, 1 h 30 min', tone: 'work' },
    ],
    report: 'Work done: “Compressed hero images and removed two unused apps.” The speed chart shows what it bought.',
  },
  23: {
    events: [{ time: '06:00', text: 'Mobile speed score up from 63 to 71 after yesterday’s work', tone: 'good' }],
    report: 'Speed: mobile score up from 61 to 74 over the month, with the jump lined up against the work that caused it.',
  },
  26: {
    events: [{ time: '03:30', text: 'One uptime check timed out; the next passed. No alert.', tone: 'plain' }],
    report: 'Uptime: 99.9% over 1,488 checks. One blip at 3:30 a.m., counted honestly.',
  },
};
const QUIET_REPORT = 'Counts toward 99.9% uptime and 30 of 31 checkout passes. Nothing to explain, which is the point.';
const SPEED = [61, 62, 60, 61, 62, 61, 60, 62, 61, 63, 62, 61, 60, 62, 63, 62, 61, 63, 62, 63, 62, 63, 71, 72, 73, 72, 73, 74, 73, 74, 74];
const REPLAY: ReplayDay[] = SPEED.map((speed, i) => ({ day: i + 1, speed, ...(REPLAY_EVENTS[i + 1] ?? { events: [], report: QUIET_REPORT }) }));

// The usual care-plan toolkit, side by side with what replaces it.
const OLD_WAY = [
  { before: 'An uptime monitor that only knows the home page loads', after: 'Uptime, a daily checkout test, speed, SSL and domain expiry in one place' },
  { before: 'Finding out about a broken checkout from the client', after: 'An alert after two failed checks, usually before the client notices' },
  { before: 'A spreadsheet of hours nobody else sees', after: 'A work log matched to the real changes on the store' },
  { before: 'A report rewritten in Google Docs every month', after: 'A branded report drafted on the 1st, ready to approve' },
];

const FAQ = [
  {
    q: 'Do you need access to my clients’ Shopify stores?',
    a: 'No. Add the store’s web address and StoreCare HQ checks the live storefront from the outside, the way a visitor would. No app to install, no staff account, no API key.',
  },
  {
    q: 'Will the checks slow the store down or place orders?',
    a: 'No. Checks are light, identify themselves as StoreCareBot and follow the store’s robots.txt. The checkout test is optional, only runs with your consent, and stops at the checkout page before any payment.',
  },
  {
    q: 'Does the free store check on this page keep anything?',
    a: 'Not on our side. It reads the public storefront once, the way a visitor’s browser does. Your own browser keeps a small summary of each store you check (theme, apps, and keys for prices and stock, not the pages themselves), so your next check can show what changed. “Forget” clears it.',
  },
  {
    q: 'Who writes the monthly report?',
    a: 'StoreCare HQ drafts it on the 1st from the month’s checks, the changes it saw and the work you logged. You read it, edit anything, approve it, and send your client a link or a PDF. Nothing reaches a client until you approve it.',
  },
  {
    q: 'Does the report carry my agency’s name?',
    a: 'Yes. Clients see your agency’s name at the top of the report. StoreCare HQ appears only as a small line in the footer.',
  },
  {
    q: 'Do I need a card for the free trial?',
    a: 'Yes. You pick a plan and add a card when you sign up, and nothing is charged for 7 days. Card details are handled by Stripe.',
  },
  {
    q: 'What happens when the trial ends?',
    a: 'Your plan starts and your card is charged for the first month. If you cancel during the 7 days, you pay nothing and monitoring stops when the trial ends. You can switch plans any time.',
  },
];

function sampleFacts() {
  const period = monthPeriod('2026-10');
  const data: MonthData = {
    period,
    store: { name: 'Juniper & Ash', public_url: 'https://juniperandash.com', health_score: 94, status: 'active', limited_reason: null },
    agency: { name: 'Northline Studio', brand_color: '#2747A8' },
    plan: { name: 'Care Plan Growth', hours_included: 10, rollover_rule: 'one_month' },
    uptime: { checks: 1488, ok: 1487, avgMs: 412 },
    incidents: [
      { kind: 'checkout', opened_at: '2026-10-14T06:02:00Z', resolved_at: '2026-10-14T06:31:00Z', cause: null, client_note: 'A shipping app update; rolled back.' },
    ],
    checkoutRuns: Array.from({ length: 31 }, (_, i) => ({ ran_at: `2026-10-${String(i + 1).padStart(2, '0')}T06:00:00Z`, result: i === 13 ? ('fail' as const) : ('pass' as const) })),
    speed: [
      { sampled_at: '2026-10-01T06:00:00Z', performance_score: 61, lcp_ms: 3400 },
      { sampled_at: '2026-10-31T06:00:00Z', performance_score: 74, lcp_ms: 2600 },
    ],
    changes: [
      { occurred_at: '2026-10-02T09:14:00Z', kind: 'theme_published', summary: 'New live theme: “Dawn – Autumn”', risky: true, work_entry_id: 'w1' },
      { occurred_at: '2026-10-17T13:05:00Z', kind: 'app_added', summary: 'Smile.io added', risky: false, work_entry_id: null },
    ],
    work: [
      { id: 'w1', work_date: '2026-10-02', minutes: 150, title: 'Autumn theme', client_text: 'Launched the autumn homepage and collections.', counts_to_plan: true },
      { id: 'w2', work_date: '2026-10-14', minutes: 45, title: 'Checkout fix', client_text: 'Rolled back a shipping app update that broke mobile checkout.', counts_to_plan: true },
      { id: 'w3', work_date: '2026-10-22', minutes: 90, title: 'Speed', client_text: 'Compressed hero images and removed two unused apps.', counts_to_plan: true },
    ],
    apps: [],
    previousMonthMinutes: 480,
    asOf: '2026-11-01T00:00:00Z',
  };
  return buildFacts(data);
}

/** "1 December": when a store added today gets its first report. */
function nextReportDate(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** What search engines read: the product, its plans and the FAQ. */
function structuredData() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'StoreCare HQ',
      url: `${WEBSITE_ORIGIN}/`,
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: DESCRIPTION,
      offers: PLANS.map((p) => ({
        '@type': 'Offer',
        name: p.name,
        price: p.price,
        priceCurrency: 'USD',
        description: `Up to ${p.stores} stores. ${p.note}`,
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ];
}

export default async function Landing() {
  const host = (await headers()).get('host') ?? '';
  const login = appLink(host, '/login');
  const signup = appLink(host, '/login?trial=1');
  const facts = sampleFacts();
  const nav = (
    <>
      <a href="#check">Check a store</a>
      <a href="#how">How it works</a>
      <a href="#pricing">Pricing</a>
      <a href="#contact">Contact</a>
      <a href={login}>Sign in</a>
    </>
  );
  return (
    <div className="lp" id="top">
      <script
        type="application/ld+json"
        // Our own constants, serialised; "<" is escaped so no text in them can close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()).replace(/</g, '\\u003c') }}
      />
      <header className="lp-top">
        <Link href="/" className="lp-brand" aria-label="StoreCare HQ home">
          <span className="mark">SC</span>
          StoreCare HQ
        </Link>
        <nav className="lp-nav" aria-label="Main">
          <div className="lp-nav-links">{nav}</div>
          <a href={signup} className="btn lp-btn-small">Start free trial</a>
          <MobileMenu>{nav}</MobileMenu>
        </nav>
      </header>

      <main>
        <BrandProvider initialColor={facts.brandColor}>
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <p className="lp-eyebrow">For Shopify freelancers and agencies with care plans</p>
            <h1>Know what changed on every client store before your client does.</h1>
            <p className="lp-lede">
              StoreCare HQ watches your clients’ stores around the clock and drafts the monthly report that proves your
              care plan is worth it.
            </p>
            <StoreScan signup={signup} />
            <p className="lp-cta-note">
              <a href={signup}>Or start your 7-day free trial →</a> From $29 a month. No Shopify access, no app to install.
            </p>
          </div>
          <BrandReport facts={facts} summary={templateSummary(facts)} sections={{ ...DEFAULT_SECTIONS, changes: false, site: false }} />
        </section>

        <section className="lp-oldway" aria-labelledby="oldway-title">
          <div className="lp-oldway-head">
            <h2 id="oldway-title">Most care plans run on four tools and a lot of trust.</h2>
            <p>Clients pay every month for work they can’t see. StoreCare HQ puts it in one place they can.</p>
          </div>
          <div className="lp-compare" role="table" aria-label="Care plans before and with StoreCare HQ">
            <div className="lp-compare-row lp-compare-labels" role="row">
              <span role="columnheader">The usual way</span><span role="columnheader">With StoreCare HQ</span>
            </div>
            {OLD_WAY.map((r) => (
              <div key={r.before} className="lp-compare-row" role="row">
                <span role="cell" className="lp-before">{r.before}</span>
                <span role="cell" className="lp-after">{r.after}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="lp-log" aria-labelledby="log-title">
          <div className="lp-log-copy">
            <h2 id="log-title">Everything that happens to a store, in one log</h2>
            <p>
              Clients install apps, change prices and swap themes without telling you. StoreCare HQ checks every store
              every 30 minutes and every morning, writes down what changed, and flags what could break a sale.
            </p>
            <p>
              Changes that match your work log are marked as yours. The rest are flagged, so you hear about them
              before the client asks why sales dipped.
            </p>
          </div>
          <LiveLog lines={LOG} times={LOG_TIMES} />
        </section>

        <section className="lp-replay" aria-labelledby="replay-title">
          <div className="lp-replay-head">
            <h2 id="replay-title">Your client reads one page. Here’s the month behind it.</h2>
            <p>
              1,488 uptime checks, 31 checkout tests, a speed score every morning, and every change matched to the
              work you logged. Step through October on the sample store and see where each day lands in the report.
            </p>
            <SampleReportLink />
          </div>
          <MonthReplay days={REPLAY} store="Juniper & Ash" month="October" year={2026} monthIndex={9} />
        </section>
        </BrandProvider>

        <section className="lp-watch" aria-labelledby="watch-title">
          <h2 id="watch-title">What it checks</h2>
          <dl className="lp-checks">
            <div><dt>Uptime and response time</dt><dd>Every 30 minutes. An alert by email or Slack after two failures in a row.</dd></div>
            <div><dt>Checkout</dt><dd>A daily test purchase on mobile and desktop that stops before payment. Optional, with your consent.</dd></div>
            <div><dt>Speed</dt><dd>Google’s lab score every morning, plus how fast the store loads for real Chrome visitors.</dd></div>
            <div><dt>Theme and apps</dt><dd>Which theme is live and which apps load on the storefront, and when either changes.</dd></div>
            <div><dt>Products and stock</dt><dd>New products, price changes and what sold out.</dd></div>
            <div><dt>Renewals and links</dt><dd>SSL certificate and domain expiry, and broken links from the home page.</dd></div>
          </dl>
        </section>

        <section id="book" className="lp-book-sec" aria-labelledby="book-title">
          <div className="lp-book-head">
            <h2 id="book-title">Paste your client list. See your dashboard before you sign up.</h2>
            <p>
              Up to five stores, checked side by side, the way StoreCare HQ shows them every morning. No account: the list
              stays in this browser, so next time you’ll see what changed on each.
            </p>
          </div>
          <PortfolioCheck signup={signup} />
        </section>

        <section className="lp-value" aria-labelledby="value-title">
          <div className="lp-value-head">
            <h2 id="value-title">What a care client is worth to you</h2>
            <p>Care plans are cancelled quietly, when a client stops seeing what they pay for. Move the sliders.</p>
          </div>
          <ValueCalculator signup={signup} />
        </section>

        <section id="how" className="lp-how" aria-labelledby="how-title">
          <h2 id="how-title">How it works</h2>
          <ol className="lp-steps">
            <li>
              <h3>Add the store’s address</h3>
              <p>Paste the store URL and the client’s care plan hours. The first checks run within half an hour.</p>
            </li>
            <li>
              <h3>Log your work as you go</h3>
              <p>A line per task with the time spent. StoreCare HQ matches it to the changes it sees on the store.</p>
            </li>
            <li>
              <h3>Approve the report on the 1st</h3>
              <p>The month’s report is drafted for you. Read it, adjust it, and send the client a link or a PDF.</p>
            </li>
          </ol>
        </section>

        <section id="pricing" className="lp-pricing" aria-labelledby="pricing-title">
          <div className="lp-pricing-head">
            <h2 id="pricing-title">Pricing</h2>
            <p>Every plan includes every check, alerts and white-label reports. Plans differ only by how many stores you look after.</p>
          </div>
          <div className="lp-plans">
            {PLANS.map((p) => (
              <div key={p.name} className={`lp-plan${p.name === 'Agency' ? ' lp-plan-mid' : ''}`}>
                <h3>{p.name}</h3>
                <div className="lp-price"><span className="lp-amount">${p.price}</span> a month</div>
                <div className="lp-stores">Up to {p.stores} stores · {`$${(p.price / p.stores).toFixed(2)}`} per store</div>
                <p>{p.note}</p>
                <a href={signup} className={`btn${p.name === 'Agency' ? '' : ' secondary'}`}>Start free trial</a>
              </div>
            ))}
          </div>
          <p className="lp-fine">Prices in US dollars, excluding VAT. Every plan starts with 7 days free: you add a card when you sign up and aren’t charged until the trial ends. Cancel before then and you pay nothing.</p>
        </section>

        <section className="lp-faq" aria-labelledby="faq-title">
          <h2 id="faq-title">Questions agencies ask</h2>
          <div className="lp-faq-list">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="lp-end" id="end">
          <div>
            <h2>Make your care plan visible.</h2>
            <p>Add your first client store in two minutes. Its first report drafts itself on {nextReportDate()}.</p>
          </div>
          <div className="lp-end-cta">
            <a href={signup} className="btn lp-btn-big">Start free trial</a>
            <a href="#check" className="lp-end-alt">Or check a store first</a>
          </div>
        </section>

        <section id="contact" className="lp-contact" aria-labelledby="landing-contact-title">
          <div className="lp-contact-inner">
            <div className="lp-contact-copy">
              <h2 id="landing-contact-title">Still deciding?</h2>
              <p>Ask us anything about your stores, a plan, or how it would fit your agency. We read every message.</p>
            </div>
            <ContactForm source="website" />
          </div>
        </section>
      </main>

      <StickyCta signup={signup} />

      <footer className="lp-foot">
        <span>© 2026 StoreCare HQ</span>
        <span>Not affiliated with Shopify.</span>
        <a href={login}>Sign in</a>
      </footer>
    </div>
  );
}

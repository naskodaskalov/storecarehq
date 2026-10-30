// Public landing page. Signed-out visitors to "/" see this (middleware rewrites); the app lives behind sign-in.

import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { appLink } from '@/lib/domains';
import { buildFacts, DEFAULT_SECTIONS, monthPeriod, templateSummary, type MonthData } from '@storecare/reports';
import { ReportView } from '@/components/report-view';
import { ContactForm } from '@/components/contact-form';
import './landing.css';

export const metadata: Metadata = {
  title: 'StoreCare HQ: monitoring and monthly reports for Shopify care plans',
  description:
    'StoreCare HQ watches your clients’ Shopify stores every day (uptime, checkout, speed, apps and theme changes) and drafts the monthly report you send them. No store access needed. 7 days free.',
};

const PLANS = [
  { name: 'Solo', price: 29, stores: 5, note: 'For freelancers with a handful of care clients.' },
  { name: 'Agency', price: 79, stores: 20, note: 'For studios running care plans as a service line.' },
  { name: 'Pro', price: 149, stores: 50, note: 'For agencies with a full maintenance book.' },
];

// What the change log shows, in the product's own words.
const LOG: { when: string; store: string; text: string; tone: 'risk' | 'good' | 'plain' }[] = [
  { when: '06:02', store: 'Ferro Coffee', text: 'Checkout test failed on mobile: stuck at the shipping step', tone: 'risk' },
  { when: '06:31', store: 'Ferro Coffee', text: 'Checkout test passed again, fixed in 29 min', tone: 'good' },
  { when: '09:14', store: 'Juniper & Ash', text: 'New live theme: “Dawn – Autumn”, matched to your work log', tone: 'plain' },
  { when: '11:40', store: 'Bloom Botanics', text: 'Prices changed on 42 products, not in your work log', tone: 'risk' },
  { when: '13:05', store: 'Kite & Kin', text: 'Smile.io added to the storefront', tone: 'plain' },
  { when: '15:22', store: 'Saltgrass Swim', text: 'Out of stock: Coastline One-Piece, all sizes', tone: 'plain' },
  { when: '18:47', store: 'Ferro Coffee', text: 'Domain ferrocoffee.co expires in 14 days', tone: 'risk' },
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

export default async function Landing() {
  const host = (await headers()).get('host') ?? '';
  const login = appLink(host, '/login');
  const signup = appLink(host, '/login?trial=1');
  const facts = sampleFacts();
  return (
    <div className="lp">
      <header className="lp-top">
        <Link href="/" className="lp-brand" aria-label="StoreCare HQ home">
          <span className="mark">SC</span>
          StoreCare HQ
        </Link>
        <nav className="lp-nav" aria-label="Main">
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#contact">Contact</a>
          <a href={login}>Sign in</a>
          <a href={signup} className="btn lp-btn-small">Start free trial</a>
        </nav>
      </header>

      <main>
        <section className="lp-hero">
          <div className="lp-hero-copy">
            <h1>Know what changed on every client store before your client does.</h1>
            <p className="lp-lede">
              StoreCare HQ watches your clients’ Shopify stores around the clock and drafts the monthly report you send
              them. Your care plan, finally visible.
            </p>
            <div className="lp-cta">
              <a href={signup} className="btn lp-btn-big">Start free trial</a>
              <span className="lp-cta-note">7 days free, then from $29 a month. No Shopify access needed.</span>
            </div>
          </div>
          <figure className="lp-hero-report">
            <div className="lp-report-frame" aria-label="Example client report">
              <ReportView facts={facts} summary={templateSummary(facts)} sections={{ ...DEFAULT_SECTIONS, changes: false, site: false }} />
            </div>
            <figcaption>
              An example report, drafted on 1 November for a fictional agency and store. Your clients see your agency’s name.
            </figcaption>
          </figure>
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
          <ol className="lp-feed" aria-label="Example day in the change log">
            {LOG.map((l, i) => (
              <li key={i} className={`lp-feed-item lp-${l.tone}`}>
                <time className="lp-feed-when">{l.when}</time>
                <span className="lp-feed-store">{l.store}</span>
                <span className="lp-feed-text">{l.text}</span>
              </li>
            ))}
          </ol>
        </section>

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
                <div className="lp-stores">Up to {p.stores} stores</div>
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

        <section id="contact" className="lp-contact" aria-labelledby="landing-contact-title">
          <div className="lp-contact-inner">
            <div className="lp-contact-copy">
              <h2 id="landing-contact-title">Contact StoreCare HQ</h2>
              <p>A question about your stores, a plan, or something we can improve? We&apos;d like to hear from you.</p>
            </div>
            <ContactForm source="website" />
          </div>
        </section>

        <section className="lp-end">
          <h2>Make your care plan visible.</h2>
          <a href={signup} className="btn lp-btn-big">Start free trial</a>
        </section>
      </main>

      <footer className="lp-foot">
        <span>© 2026 StoreCare HQ</span>
        <span>Not affiliated with Shopify.</span>
        <a href={login}>Sign in</a>
      </footer>
    </div>
  );
}

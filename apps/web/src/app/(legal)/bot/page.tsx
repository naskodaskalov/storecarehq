import type { Metadata } from 'next';
import { LegalPage, legalMetadata } from '../legal-page';

export const metadata: Metadata = legalMetadata('/bot', 'StoreCareBot · StoreCare HQ', 'What StoreCareBot is, what it requests from a store, how often, and how to limit or block it.');

export default function Bot() {
  return (
    <LegalPage
      path="/bot"
      title="StoreCareBot"
      intro={
        <p>
          If you found <code>StoreCareBot</code> in your logs: it is the monitoring service of StoreCare HQ. An agency or
          freelancer that looks after this store added it so they hear about problems, such as the store going down or
          checkout breaking, before customers do.
        </p>
      }
    >
      <h2>How to recognise it</h2>
      <p>Every request identifies itself with this user agent. We never disguise it.</p>
      <pre>Mozilla/5.0 (compatible; StoreCareBot/0.1; +https://storecarehq.com/bot)</pre>

      <h2>What it requests, and how often</h2>
      <table>
        <thead><tr><th>Check</th><th>Requests</th><th>How often</th></tr></thead>
        <tbody>
          <tr><td>Uptime</td><td>The home page</td><td>About every 30 minutes</td></tr>
          <tr><td>Theme and apps</td><td><code>/robots.txt</code> and the home page</td><td>About hourly</td></tr>
          <tr><td>Products, prices and stock</td><td><code>/products.json</code>, the public product feed</td><td>Daily, paced between pages</td></tr>
          <tr><td>Speed</td><td>Google PageSpeed Insights loads the home page (Google’s own user agent)</td><td>Daily</td></tr>
          <tr><td>Renewals and links</td><td>The certificate, domain registry and links on the home page</td><td>Daily</td></tr>
          <tr><td>Checkout test, only with the store owner’s agreement</td><td>Adds one product to a basket and opens checkout, on mobile and desktop</td><td>Daily</td></tr>
        </tbody>
      </table>
      <p>
        StoreCareBot only reads public pages. It never signs in, never types into checkout and never places an order: the
        checkout test stops at the checkout page before any customer or payment details. It waits between requests to
        the same store.
      </p>

      <h2>robots.txt</h2>
      <p>
        StoreCareBot reads your <code>robots.txt</code> before reading pages, the product feed or links, and skips anything
        it disallows. To keep it out of everything it crawls:
      </p>
      <pre>{'User-agent: StoreCareBot\nDisallow: /'}</pre>
      <p>
        To keep it out of the product feed only, disallow <code>/products.json</code>. Two checks are not crawling and run
        regardless: the uptime check (one home-page request about every 30 minutes, like any uptime monitor) and the
        checkout test, which runs only with the store owner’s agreement. To stop those, ask the agency that looks after
        the store, or tell us. If your firewall blocks StoreCareBot, we record the store as “limited”, never as “down”,
        and tell the agency why.
      </p>

      <h2>Something wrong?</h2>
      <p>
        If StoreCareBot is visiting a store it shouldn’t, or more often than this page says, tell us through the contact
        form with the store’s address. We will look into it and, if the agency is not entitled to monitor the store,
        stop the checks.
      </p>
    </LegalPage>
  );
}

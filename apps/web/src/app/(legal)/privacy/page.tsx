import type { Metadata } from 'next';
import { LegalPage } from '../legal-page';

export const metadata: Metadata = {
  title: 'Privacy policy · StoreCare HQ',
  description: 'What StoreCare HQ collects, why, who processes it for us, how long we keep it and your rights.',
};

export default function Privacy() {
  return (
    <LegalPage
      path="/privacy"
      title="Privacy policy"
      intro={
        <>
          <p>StoreCare HQ monitors Shopify storefronts for agencies and drafts the monthly reports they send their clients. This page explains what personal data we handle, why, and what you can ask us to do with it.</p>
          <div className="legal-summary">
            <strong>In short</strong>
            <ul>
              <li>We only check the public side of stores. We never log in to a store or see its customers or orders.</li>
              <li>We keep account, billing and monitoring data to run the service, and nothing for advertising.</li>
              <li>No advertising cookies. Google Analytics runs on our website only if you accept it, and never in the app.</li>
              <li>Our database is hosted in the EU (Ireland).</li>
            </ul>
          </div>
        </>
      }
    >
      <h2>Who is responsible</h2>
      <p>
        StoreCare HQ is the controller for the personal data of people who visit our website, contact us or hold an
        account. For the data an agency adds about its own clients (for example a client contact who receives
        reports), the agency is the controller and we process that data on its behalf, as described in our{' '}
        <a href="/dpa">data processing terms</a>.
      </p>

      <h2>What we collect and why</h2>
      <table>
        <thead><tr><th>Data</th><th>Why</th><th>Legal basis</th></tr></thead>
        <tbody>
          <tr><td>Account: your email address, password (stored hashed by our authentication provider) and agency details you enter, such as agency name, brand colour, logo and reply-to address</td><td>To give you access and put your branding on reports</td><td>Contract</td></tr>
          <tr><td>Billing: plan, trial and subscription status. Card details go straight to Stripe; we never see or store them</td><td>To charge for the service and apply plan limits</td><td>Contract; legal obligations for tax records</td></tr>
          <tr><td>Client stores: store addresses, care-plan hours, work-log entries you write, alert destinations (email addresses, Slack webhooks) and client report recipients</td><td>To monitor stores, send alerts and draft and deliver reports</td><td>Contract (and, for client contacts, the agency’s instructions)</td></tr>
          <tr><td>Monitoring results: uptime, speed, theme and app changes, product and price changes, checkout tests and site checks of public storefronts</td><td>The service itself</td><td>Contract</td></tr>
          <tr><td>Contact form messages: name, email, topic and message</td><td>To answer you</td><td>Legitimate interest in replying to enquiries</td></tr>
          <tr><td>Technical logs: IP address, browser and request details kept by our hosting and database providers</td><td>Security, abuse prevention and fixing faults</td><td>Legitimate interest</td></tr>
          <tr><td>Website analytics (only if you accept): pages viewed, how you reached the site, approximate location, device and browser, and clicks such as “Start free trial”, collected by Google Analytics with a random cookie ID</td><td>To understand how people find and use our website</td><td>Consent, which you can withdraw at any time with “Cookie settings”</td></tr>
        </tbody>
      </table>
      <p>
        Monitoring reads only what any visitor can see. It does not collect personal data about a store’s shoppers.
        The optional checkout test adds a product to a basket and stops at the checkout page before any personal or
        payment details are entered.
      </p>

      <h2>The free store check on our website</h2>
      <p>
        When you check a store on our website, our server reads that store’s public pages once and returns a summary.
        We do not store the result. Your own browser keeps a small summary of the stores you checked (theme, apps, and
        keys for prices and stock) so your next check can show what changed. You can clear it with “Forget” at any
        time, or by clearing this site’s data in your browser.
      </p>

      <h2 id="cookies">Cookies and local storage</h2>
      <ul>
        <li><strong>Sign-in cookies</strong> keep you signed in to the app. They are strictly necessary.</li>
        <li><strong>A short-lived “store you checked” cookie</strong> (<code>sc_store</code>, 7 days) pre-fills the store address when you start a trial after checking a store.</li>
        <li><strong>Local storage</strong> in your browser for the stores you checked on our website, as above, and your cookie choice (<code>sc_analytics</code>).</li>
        <li><strong>Google Analytics cookies</strong> (<code>_ga</code>, <code>_ga_*</code>, up to 2 years), only on our public website and only if you click “Accept”. They count visits, pages viewed, how you reached us and clicks such as “Start free trial”. Google signals and ad personalisation are off. You can change your mind any time with “Cookie settings” at the bottom of the page; declining removes these cookies.</li>
      </ul>
      <p>We use no advertising cookies. The app you sign in to has no analytics.</p>

      <h2>Who processes data for us</h2>
      <table>
        <thead><tr><th>Provider</th><th>What for</th><th>Where</th></tr></thead>
        <tbody>
          <tr><td>Supabase</td><td>Database and sign-in</td><td>EU (Ireland)</td></tr>
          <tr><td>Google (Analytics)</td><td>Website visit statistics, only with your consent</td><td>EU and US (EU–US Data Privacy Framework)</td></tr>
          <tr><td>Vercel</td><td>Hosting the website and app</td><td>Global edge network; may process data outside the EU</td></tr>
          <tr><td>GitHub (Microsoft)</td><td>Running the scheduled monitoring jobs</td><td>United States</td></tr>
          <tr><td>Stripe</td><td>Payments and subscriptions</td><td>EU and United States</td></tr>
          <tr><td>Resend</td><td>Sending alert, report and contact emails</td><td>United States</td></tr>
          <tr><td>Google</td><td>PageSpeed Insights speed measurements (receives store addresses, not personal data)</td><td>United States</td></tr>
          <tr><td>Anthropic</td><td>When enabled, writing the three-sentence summary at the top of a draft report from that month’s monitoring facts</td><td>United States</td></tr>
          <tr><td>Slack</td><td>Delivering alerts, only if you add a Slack destination</td><td>United States</td></tr>
        </tbody>
      </table>
      <p>
        Where data leaves the European Economic Area we rely on the EU–US Data Privacy Framework where the provider is
        certified, or on the European Commission’s standard contractual clauses.
      </p>
      <p>We do not sell personal data, and we do not use it for advertising.</p>

      <h2>How long we keep it</h2>
      <ul>
        <li>Account and store data: while your account is open, and deleted within 30 days of a closure request.</li>
        <li>Storefront snapshots: 90 days. Uptime, speed and site-check history: 13 months, so reports can compare months.</li>
        <li>Reports you approve: while your account is open, so shared client links keep working.</li>
        <li>Billing records: as long as tax law requires.</li>
        <li>Contact form messages: we don’t store them in the app; they arrive as email and are kept only as long as the conversation needs.</li>
      </ul>

      <h2>Your rights</h2>
      <p>
        You can ask us for a copy of your data, to correct it, to delete it, to restrict or object to how we use it, or
        to receive it in a portable format. Write to us through the contact form and we will reply within one month. If
        you are not satisfied, you can complain to your local data protection authority.
      </p>
      <p>If you are a client of an agency that uses StoreCare HQ, please contact that agency first; we will help them answer you.</p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit, access is limited to each agency’s own members by database row-level security, and
        provider credentials are kept in encrypted vaults rather than in our code.
      </p>

      <h2>Changes</h2>
      <p>If we change this policy in a way that matters, we will tell account holders by email before the change takes effect.</p>
    </LegalPage>
  );
}

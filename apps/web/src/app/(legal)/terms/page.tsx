import type { Metadata } from 'next';
import { LegalPage } from '../legal-page';

export const metadata: Metadata = {
  title: 'Terms of service · StoreCare HQ',
  description: 'The terms for using StoreCare HQ: trial, billing, cancellation, acceptable use and responsibilities.',
};

export default function Terms() {
  return (
    <LegalPage
      path="/terms"
      title="Terms of service"
      intro={
        <p>
          These terms apply when you or your agency use StoreCare HQ. By creating an account you agree to them on behalf
          of yourself and the agency you sign up for. They are written to be read; if anything is unclear, ask us.
        </p>
      }
    >
      <h2>1. The service</h2>
      <p>
        StoreCare HQ checks the public storefronts of Shopify stores you add (uptime, speed, theme, apps, products and
        prices, site renewals and, if you enable it, a daily checkout test), alerts you to problems, keeps a work log and
        drafts a monthly report for each store that you can edit, approve and send to your client. StoreCare HQ is not
        affiliated with or endorsed by Shopify.
      </p>
      <p>
        Monitoring runs on a schedule and depends on third-party infrastructure, including the stores themselves. Checks
        can be delayed, blocked by a store’s firewall or miss a short outage. StoreCare HQ helps you look after stores;
        it does not replace your own judgement, backups or the store owner’s responsibility for the store.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must be at least 18 and use the service for business purposes.</li>
        <li>Keep your sign-in details safe. You are responsible for what happens in your account, including actions by people you give access to.</li>
        <li>Give us accurate details and keep your contact email working: we send billing notices and important alerts to it.</li>
      </ul>

      <h2>3. Stores you add</h2>
      <ul>
        <li>Only add stores you look after for a client, or your own, and only where you are entitled to monitor them.</li>
        <li>The daily checkout test runs only after you confirm that your client agrees to it. It stops before payment, but it does create basket activity on the store.</li>
        <li>Our checks identify themselves as <a href="/bot">StoreCareBot</a>, and reading pages and product feeds follows each store’s robots.txt. Do not ask us to disguise them or to get around a store’s bot protection.</li>
        <li>You are responsible for the content of the reports and messages you send to clients, including any text we draft for you. Read drafts before you approve them; nothing is sent to a client without your approval.</li>
      </ul>

      <h2>4. Free trial, plans and billing</h2>
      <ul>
        <li>Every first plan starts with a 7-day free trial. We take a card at sign-up and charge nothing until the trial ends. If you cancel during the trial, you pay nothing.</li>
        <li>After the trial, plans are billed monthly in advance, in US dollars. Prices exclude VAT and other taxes, which are added at checkout where they apply.</li>
        <li>Payments are handled by Stripe. Where Stripe sells the subscription to you as merchant of record (shown at checkout and on your receipt), Stripe’s terms for that purchase also apply, and Stripe collects and pays the tax and handles payment questions and refunds.</li>
        <li>Plans differ by how many stores you can monitor. You can change plan at any time; changes apply from the next billing period unless the billing page says otherwise.</li>
        <li>If a payment fails, we will remind you. If it stays unpaid, monitoring of your stores pauses until the account is paid up.</li>
        <li>We may change prices with at least 30 days’ notice by email. The new price applies from your next billing period after that.</li>
      </ul>

      <h2>5. Cancelling</h2>
      <p>
        You can cancel at any time from the billing page. Your plan stays active until the end of the period you have
        paid for, and then monitoring stops. We do not refund partial months, except where the law requires it. You can
        ask us to delete your account and data at any time; see the <a href="/privacy">privacy policy</a>.
      </p>

      <h2>6. Acceptable use</h2>
      <p>Don’t use StoreCare HQ to:</p>
      <ul>
        <li>monitor or load-test sites you have no right to monitor, or overload any site;</li>
        <li>break the law, infringe others’ rights or send unsolicited marketing through our report or email features;</li>
        <li>probe, scan or test the security of our service, or get around plan limits, rate limits or access controls;</li>
        <li>resell the service as a standalone product. Sending branded reports to your own clients is exactly what it is for.</li>
      </ul>
      <p>We may suspend accounts that break these rules, after a warning where that is reasonable.</p>

      <h2>7. Your data</h2>
      <p>
        You own the data you put into StoreCare HQ and the reports you produce. You give us permission to process it only
        to provide and improve the service, as described in the <a href="/privacy">privacy policy</a> and the{' '}
        <a href="/dpa">data processing terms</a>, which form part of these terms. You can ask for an export of your
        reports and work log at any time.
      </p>

      <h2>8. Availability and changes</h2>
      <p>
        We work to keep the service available but don’t promise it will be uninterrupted. We improve the product often; if
        we remove a feature you rely on or make a change that materially reduces the service, we will tell you in advance
        and you may cancel.
      </p>

      <h2>9. Liability</h2>
      <p>
        The service is provided as it is. To the extent the law allows, we are not liable for indirect or consequential
        losses, such as lost sales, lost profit or lost data, including losses from a store problem that monitoring did not
        detect or report in time. Our total liability for any claim is limited to the fees you paid us in the 12 months
        before the claim. Nothing in these terms limits liability that cannot be limited by law.
      </p>

      <h2>10. Changes to these terms</h2>
      <p>
        We may update these terms. For changes that matter, we will email account holders at least 30 days before they
        take effect. If you keep using the service after that, the new terms apply; if you don’t agree, you can cancel.
      </p>
    </LegalPage>
  );
}

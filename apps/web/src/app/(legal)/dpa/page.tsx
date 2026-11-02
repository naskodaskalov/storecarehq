import type { Metadata } from 'next';
import { LegalPage, legalMetadata } from '../legal-page';

export const metadata: Metadata = legalMetadata('/dpa', 'Data processing terms · StoreCare HQ', 'How StoreCare HQ processes personal data on behalf of agencies, under Article 28 GDPR.');

export default function Dpa() {
  return (
    <LegalPage
      path="/dpa"
      title="Data processing terms"
      intro={
        <p>
          When your agency adds client details to StoreCare HQ (for example a client contact who receives monthly reports),
          your agency is the controller of that personal data and StoreCare HQ processes it on your behalf. These terms
          form part of our <a href="/terms">terms of service</a> and cover what Article 28 of the GDPR requires.
        </p>
      }
    >
      <h2>Subject matter and duration</h2>
      <p>We process personal data only to provide StoreCare HQ to your agency, for as long as your account is open and for up to 30 days after it closes, unless the law requires us to keep it longer.</p>

      <h2>Nature and purpose</h2>
      <p>Storing, organising and sending: monitoring alerts to the destinations you configure, and monthly reports to the client contacts you choose.</p>

      <h2>Types of data and people</h2>
      <ul>
        <li>People: your agency’s members, and your clients’ staff whose details you add.</li>
        <li>Data: names, email addresses, Slack destinations, and any personal data you write into work-log entries or reports.</li>
        <li>We do not process data about a store’s shoppers: monitoring only reads public storefront pages.</li>
      </ul>

      <h2>Our commitments</h2>
      <ul>
        <li>We act only on your documented instructions, which are your use of the service and these terms. If we think an instruction breaks data protection law, we will tell you.</li>
        <li>Everyone with access to the data is bound by confidentiality.</li>
        <li>We keep appropriate security measures, including encryption in transit, per-agency access control enforced in the database, and restricted access to production systems.</li>
        <li>We use the sub-processors listed in our <a href="/privacy">privacy policy</a>, under written terms that give at least the same protection. We will tell you about new sub-processors at least 14 days before they start, so you can object; if we can’t resolve an objection, you can cancel.</li>
        <li>We help you answer requests from the people whose data it is, and with security and data protection assessments where relevant to our service.</li>
        <li>We tell you without undue delay, and within 48 hours of becoming aware of it, if a personal data breach affects your data.</li>
        <li>When your account closes, we delete your data within 30 days, or return it first if you ask.</li>
        <li>We make the information needed to show compliance available, and allow reasonable audits, normally by questionnaire, with reasonable notice.</li>
      </ul>

      <h2>International transfers</h2>
      <p>Our database is hosted in the EU. Where a sub-processor handles data outside the European Economic Area, transfers rely on the EU–US Data Privacy Framework or the European Commission’s standard contractual clauses.</p>

      <h2>Need a signed copy?</h2>
      <p>If your agency needs a countersigned data processing agreement, ask us through the contact form and we will send one with these terms.</p>
    </LegalPage>
  );
}

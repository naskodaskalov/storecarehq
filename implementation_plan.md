# Agency outreach preparation

Status: proposed; no product code, production data, or email sending changed.

## Outcome

Prepare personalized outreach packs inside the existing admin area. Each pack contains a dated real storefront health check, a clearly labeled illustrative monthly report, and an editable outreach message. Start with 20 reviewed agencies from Shopify's ongoing website management directory.

## Existing behavior verified

- Admin quick reports require the configured admin session, run public storefront checks, support printing/saving as PDF, and generate a copyable note. Results are currently transient.
- Monthly reporting loads dated monitoring and work records. The scheduled worker skips stores created after the reported month ended.
- The existing ReportView renders both internal previews and shared client reports.
- Adding a store now and backdating example hours does not recreate last month's monitoring history.

## First implementation: preparation only

### Workflow

1. Add an Outreach tab/link under admin alongside Quick report.
2. Import a CSV of reviewed agencies: agency_name, agency_url, directory_url, contact_name, contact_email, client_store_url, portfolio_source_url. Also allow entering a single agency. Validate URLs, field lengths, CSV quoting, duplicate agency domains, and duplicate contacts. Never invent emails or assume an agency's own website is a Shopify store.
3. Require review of the portfolio link/store match before scanning. A public portfolio is evidence of past work, not proof of a current maintenance contract.
4. Prepare selected packs sequentially in small batches using the existing admin quick-report action. Show per-agency progress, blocked/failed checks, and retry only failures. No checkout automation or recurring monitoring is enabled for prospects.
5. Build a separate illustrative monthly report with the prospect agency's name and a fictional store, reusing ReportView. Default period: October 2026 when prepared in November 2026, calculated dynamically thereafter. Example work: theme adjustments 2h, image optimization 1.5h, app review 1h, maintenance review 0.5h. All hours and any illustrative metrics are visibly marked as sample data in both screen and print views. Do not claim that these tasks were performed or that the agency endorsed the report.
6. Draft a short email from verified agency details and actual scan results, linking the observed facts to monitoring/reporting benefits. Include scan date and limitations. Unavailable checks are not failures; do not invent incidents, historic uptime, lost revenue, or improvements.
7. Let the admin edit/copy the message, print either report, and export a resumable JSON pack plus a spreadsheet-safe CSV summary. Warn before leaving with unsaved work. Export/import retains drafts and statuses without adding prospect data to operational store/work tables.

### Exact files

- [MODIFY] apps/web/src/app/admin/page.tsx — link to outreach preparation.
- [NEW] apps/web/src/app/admin/outreach/page.tsx — admin outreach page, request duration/dynamic settings consistent with admin quick reports.
- [NEW] apps/web/src/app/admin/outreach/outreach-form.tsx — CSV/manual input, review, sequential preparation, editable drafts, print and export/import controls.
- [NEW] apps/web/src/app/admin/outreach/outreach.css — scoped outreach and print layout, always-visible sample labels.
- [NEW] apps/web/src/lib/outreach.ts — typed prospect/pack models, CSV parsing and safe export, normalization/deduplication, pack serialization, factual message templates.
- [NEW] apps/web/src/lib/sample-month-report.ts — deterministic illustrative monthly facts/summary using the existing report types, without database writes.
- [NEW] apps/web/src/lib/outreach.test.ts — malformed imports, deduplication, formula-safe exports, round-trip state, drafts without fabricated findings.
- [NEW] apps/web/src/lib/sample-month-report.test.ts — month/year boundaries, explicitly illustrative content, correct hours totals and report type compatibility.
- [MODIFY] system_architecture.md — document admin-only preparation and isolation from real work/monitoring records.

### Verification

- Run web unit tests and repository type checks, then the web production build.
- Exercise one manual prospect and a small CSV, including failed/blocked scans and export/import recovery.
- Inspect both print views for sample labels and separation of measured versus illustrative data.
- Verify admin access is enforced by the existing layout and every reused server action.
- Confirm preparing packs does not add stores, work, monitoring consent, or outgoing emails.

## Outreach launch

Review the first 20 agencies and their public business contact details. Send reviewed messages to agency contacts, not their portfolio merchants. Lead with one current observation and offer the sample report; do not imply a current client relationship. Initial sending uses the user's mailbox after preparation and recipient/message review.

## Later automation, after validating the first batch

- Directory ingestion: bounded, resumable collection of public profiles with source URLs, pagination, deduplication and respectful request pacing; verify permitted access before running collection. Discover agency business contacts and portfolio candidates for human review.
- Durable admin prospect database and scan queue, separate from operational agency/store records; status history, resuming jobs and saved report snapshots.
- Expiring/revocable unlisted report links that are excluded from indexing and retain sample notices. Publishing links must be an explicit action.
- Outbound sending with a configured sender and reply address, reviewed recipients/messages, durable send deduplication, delivery status and opt-out suppression. Do not reuse ordinary client-report sending as a marketing campaign sender without these changes.
- Follow-ups stop on replies, opt-outs and bounces; automate sending only once inbound reply detection and suppression are reliable.

These later phases require a separate concrete implementation plan after sender choice, storage and campaign behavior are settled. No production account seeding or backdated operational records are needed for the first implementation.

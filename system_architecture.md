# Website and app domains

## Admin outreach preparation

### Requested agency report delivery

The admin outreach page now resolves the signed-in admin email on the server and passes
only safe sender/recipient readiness information to `EmailComposer`. Demo mode previews only.
`outreach-email.ts` produces branded HTML and plain text with two hosted report URLs, with
no email attachments. Standalone report HTML is retained for explicit downloads. Preview and
sending use the same pure template. Subjects and report references are retained in version-1
JSON backups; older backups still load. Imported report references are never trusted as approval.

After the user confirmed that the agency requested the report or opted in, production configuration
now uses agency delivery through Resend. The actual recipient is validated from the saved input's
CSV `contact_email`; the reply-to remains the authenticated admin email. The exact recipient is shown
beside approval/send controls. Missing or invalid contacts cannot be approved or sent. No email is sent
automatically. Legacy internal test-named helpers remain for compatibility; explicit test configurations
still target only the admin. Approval signatures and idempotency keys include the delivery mode, so an
old test approval cannot authorize an agency send. `OUTREACH_FROM` defaults to StoreCare HQ <support@storecarehq.com> and must
be verified in Resend. Credentials stay server-side. Each action calls `requireAdmin` independently.
Approval is an HMAC-signed digest of the rendered provider payload, bound to sender, recipient,
subject, text and exact report URLs and valid for 15 minutes. Before approval or sending,
`requireSavedReports` also verifies owner, token hashes, snapshot digest, expiry and revocation.
Changed report data cannot reuse a saved version or its approval.
Resend's idempotency key is the payload digest; renewed approvals/retries use identical payloads
and keys, deduplicated by Resend for 24 hours. This is provider deduplication, not a durable
campaign send ledger. Acceptance is displayed separately from confirmed delivery. Unknown
acceptance permits an explicit same-key retry; no automatic retry occurs. No sends happen on import,
preview or approval. Outreach status remains manually managed. Cold introductions, automated follow-ups
and durable campaign send/suppression state remain later rollout work.

Preparation now tracks queued/running agencies separately. Dependent composer and report sections
stay mounted but hidden/inert while their agency is queued/running, replaced with accessible status
and reduced-motion-aware skeletons. Already completed agencies remain usable during another scan.
Completion, failure and stopping clear queue state without discarding edited drafts.

### Hosted outreach report links

`outreach-report-links.ts` publishes immutable report-only snapshots, separate from operational
stores/work/reports, to `outreach_report_snapshots`. Apply migration
`20261102135722_outreach_report_links.sql` (applied to the StoreCare HQ database on 2026-11-02).
Browser roles have no table privileges
or RLS policies; server actions use the existing service client after `requireAdmin`. The database
grants the service only insertion, reads and revocation updates; a trigger prevents snapshot changes
or undoing revocation. Two independent random 32-byte bearer tokens are generated for each bundle;
only their SHA-256 hashes are stored. Tokens themselves remain in the admin's exportable references.

Public `/outreach/r/<token>` views and `/download` return only the matching report's content,
with no owner/contact/draft data. Middleware permits only these route shapes without auth and sets
no-store, noindex and no-referrer headers. Page data is dynamic; both view and download recheck
30-day expiry and revocation. Download responses use fixed HTML filenames, escaped standalone
documents, and a restrictive CSP. Save as PDF uses the browser's print dialog. Sample notices remain
in all renderings. Publishing and revoking are explicit admin actions. Revoke existing links before
refreshing a linked health check; the next publication creates a new version and clears approval.
Links use the configured `NEXT_PUBLIC_APP_URL` origin (the production app domain). Demo mode uses
process-local memory solely for preview/browser testing; it never enables email delivery.

### Prospect preparation

`/admin/outreach` uses the existing admin session gate and `quickReport` server action.
Prospects, review flags, current scan snapshots, editable drafts and manual outreach statuses
live in browser memory and can be exported/restored through a versioned JSON backup.
CSV summaries neutralize spreadsheet formulas. Imports require agency/store/portfolio URLs,
reject duplicate agency domains or contacts, and are capped at 100 prospects. Each batch
prepares up to 20 reviewed agencies sequentially; failed checks remain retryable.

`sample-month-report.ts` builds a fictional previous-month report using shared report types.
It never creates stores, work entries, monitoring history or checkout consent. Screen and
print views label the sample; measured health checks are a separate view. Drafts use only
neutral measured PageSpeed observations, not failed-check or revenue claims. Preparing a pack
sends no email, creates no public report link, and schedules no recurring prospect scans.
Export a JSON backup before leaving; CSV summaries are not full backups. Agency sending and
follow-up suppression, durable prospect storage, and directory ingestion are later phases.

## Host routing

Production uses one Next.js deployment on Vercel with two distinct hosts:

- `www.storecarehq.com` (with apex redirect): public landing page regardless of authentication.
- `app.storecarehq.com`: login, registration, recovery, onboarding and the agency application.

`apps/web/src/lib/domains.ts` defines the exact production origins and pure host/session routing rules.
Middleware reads the request Host header (Next's internal URL can use a different hostname), handles
website/app boundaries first, and then verifies app sessions with Supabase `getUser`. Refreshed
session cookies must be copied onto redirects. The app layout still resolves agency membership,
onboarding and billing access through existing RLS-protected queries.

Sessions and PKCE verifier/recovery-intent cookies stay on the host that initiates authentication.
Do not share cookies across `.storecarehq.com` or pass session tokens between the website and app.
Users migrating from the old website session sign in once on the new app host. Landing-page CTAs
use ordinary full navigations directly to the app host. Public content does not query agency sessions.

Legacy app GET URLs redirect to the app host with path/query preserved. Old-host POST submissions
receive a 409 and instructions to reopen login, rather than replaying credentials across origins.
Existing shared `/r/…` links, signed Stripe webhook deliveries and in-flight auth callback/password
pages remain available at their original hosts. Auth public-path matching respects path boundaries.

Localhost retains the combined landing/app behavior. Preview auth callbacks only use the exact
Vercel deployment hostname supplied by Vercel, and must also be explicitly allowed in Supabase.
Unknown Host values cannot become auth-code redirect destinations.

Production configuration: `NEXT_PUBLIC_APP_URL=https://app.storecarehq.com`; worker `APP_URL` uses
the same app origin. Supabase Site URL is the app origin, with exact `/auth/callback` allowlist
entries. Keep old and local callback entries during migration. Resend sender settings are independent
of the website/app split.

Run web unit tests and a production build. With the built server running, set
`STORECARE_ROUTING_TEST_ORIGIN=http://localhost:<port>` when running web tests to exercise actual
Host handling, marketing CTA URLs, app login entry, legacy redirects and blocked old-host POSTs.

# Requested health checks

`health_check_requests` is the durable scan queue and user-visible progress source. Store creation
queues a baseline scan in the same transaction; manual requests use the membership/billing-checked
`request_health_check(uuid)` RPC. Only the worker writes phase results, leases and final state.
The existing GitHub runner is woken through a private throttled Supabase dispatcher using its
existing Vault credential; one-minute Cron retries supplement regular thirty-minute monitoring.

`apps/worker/src/health-check-requests.ts` handles claims, consent, phase results and recovery.
`store-lock.ts` coordinates requested/scheduled work with a dedicated-connection advisory lock;
all protected jobs must use that connection. Never hold an advisory lock through `pool.query`
and then assume a different pooled connection owns it. A scan lease lasts fifteen minutes and
refreshes at phase boundaries; expired work resumes completed phases and stops after two attempts.
Use a direct database connection or Supabase's session pooler, not transaction pooling, for these locks.

The store page renders `HealthCheckStatus`. Its authenticated, no-store API reads only agency-scoped
status columns. It polls active scans, stops on terminal status/error, and refreshes store metrics
when work finishes. New request RPCs deduplicate active scans and enforce a five-minute cooldown
under a row lock. Checkout remains subject to existing consent/devices/product prerequisites.

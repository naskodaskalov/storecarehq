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
and keys, deduplicated by Resend for 24 hours. Acceptance is displayed separately from confirmed
delivery. Unknown acceptance permits an explicit same-key retry; no automatic retry occurs. No sends
happen on import, preview or approval. Each accepted (or unconfirmed) send is saved to the outreach
history below, and an accepted send marks the agency "contacted"; other statuses stay manual.
Cold introductions, automated follow-ups and suppression lists remain later rollout work.

Preparation now tracks queued/running agencies separately. Dependent composer and report sections
stay mounted but hidden/inert while their agency is queued/running, replaced with accessible status
and reduced-motion-aware skeletons. Already completed agencies remain usable during another scan.
Completion, failure and stopping clear queue state without discarding edited drafts.

### Outreach history

`sendOutreachTest` saves every agency email the provider accepted, or whose acceptance is unconfirmed
after a timeout, to `outreach_contacts` (migration `20261102221500_outreach_contacts.sql`): sender
admin, agency name and website domain, contact, store, subject, introduction text, report-links id,
delivery state and provider message id. Rejected emails and test-mode sends are not saved. The row key
is the provider payload digest (the same value as Resend's idempotency key), so a retry of the same
approved email never adds a second row, and a confirmed retry upgrades an unconfirmed one. Browser
roles have no access; the service role may only read, insert and update the delivery fields. If saving
fails after a send, the admin sees that the email went out but is missing from the history.

`/admin/outreach` loads the newest 1,000 rows (without message text) into a searchable history panel.
An agency counts as contacted before when its website domain (ignoring `www.`) or contact email matches
a saved row: the agency list shows a "Contacted <date>" badge, the agency card and send panel warn
before writing again, and batch preparation skips it (it can still be prepared on its own).

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

## Admin overview

`/admin` is the overview; the quick report moved to `/admin/quick-report`. One call to
`public.admin_metrics(p_tz)` (migration `20261102221600_admin_metrics.sql`, service role only, called
after `requireAdmin`) returns sign-ups, stores, workspaces and outreach emails for today, the last 7
calendar days and in total; subscription counts by plan for MRR and trial pipeline at list prices; the
onboarding funnel (signed up, confirmed email, workspace, store, trial with card, paying); the 10 newest
sign-ups with their workspace, plan state and store count; last-7-day product activity; and the
`monitoring_freshness()` result. Days start at midnight in `STORECARE_ADMIN_TIMEZONE` (default
Europe/Sofia). Deleted and anonymous auth users are excluded; deleted stores and workspaces are not
counted. Demo mode shows sample numbers.

# BFCM readiness audit

`/bfcm` (nav item "BFCM audit", shown from 60 days before Black Friday until Cyber Monday, or while on the page;
the Overview shows a countdown banner) checks every unpaused client store and keeps one dated one-pager per run in
`store_audits` (migration `20261105120000_store_audits.sql`). Black Friday is the day after the fourth Thursday of
November; `saleDates` in `lib/bfcm.ts` rolls to next year after Cyber Monday.

The board posts each store to `POST /api/bfcm/<id>`, three at a time, and shows Waiting / Checking / result /
Retry per row. It is a route handler, not a server action, because Next.js runs a page's server actions one after
another. The handler rejects other origins and calls `runAudit` (`lib/bfcm-run.ts`): signed in, agency member, billing
access, store found and not paused; a check of the same store in the last 2 minutes is returned instead of a new one.
`runStoreAudit` (`lib/bfcm-data.ts`) reads monitoring data under RLS (latest home speed sample, latest site check,
checkout runs from 48 hours, open incidents, 30-day uptime, 14 days of theme/app changes) and runs one live pass:
`probeStore` without feed or cart, 10 s per request, plus up to 3 product JSON requests. Certificate and domain are
re-read live only when the site check is older than 3 days. `buildBfcmAudit` is pure and shared with outreach.
Verdicts: `fix` (anything to fix), `partial` ("Not fully checked": the storefront could not be loaded and nothing
needs fixing, so a store is never called ready on checks that did not run), `look`, `ready`. Failed checks have no
email phrase, so they never become a claim in an email. Demo mode returns fixed results per store after a short delay.

An audit row is immutable apart from `note`, `shared_at`, `sent_at` and `sent_to` (column grants). RLS lets members
read their agency's audits and insert only for their own agency's unpaused stores, as themselves, while the plan has
access; there are no deletes (they go with the store). Each row gets a 64-character random `share_token`; the client
link `/r/audit/<token>` is public (middleware passes `/r/`) and reads only through `public_audit(token)`, a security
definer function that returns the audit, note and agency branding when `shared_at` is set and the token is at least 32
characters. Turning the link off clears `shared_at`; the page is noindex/nofollow/noarchive. Sending uses the agency's
branded email layout (`brandedEmailHtml`, shared with monthly reports) through Resend with an idempotency key per
audit, note version and recipient; without Resend the agency gets a mailto link and marks it as sent. Sending turns
the link on. The one-pager prints on one A4 or Letter page through the browser print dialog (`body:has(.bfcm-print)`).

Storefront states live in `packages/storefront/src/states.ts` and run inside `probeStore` with no extra requests: the
password page (`/password` answers 200 with `pageType` "password"), "Store unavailable" (404), noindex (meta in the
head or `X-Robots-Tag` for all bots or Googlebot), Googlebot disallowed from `/`, and product handles the home page
links to (`<main>` first, own host only). `checkProducts` reads `/products/<handle>.js` (stock from `available`,
404 = gone) within robots.txt rules. On a password or unavailable page the probe skips the feed and cart. The worker's
hourly storefront snapshot skips both states, so turning a password page on or off no longer logs apps as removed
or added; the landing scan no longer calls a password page "headless".

Outreach: the quick report carries a prospect one-pager (live checks only; checkout, uptime and recent changes show
as not checked), except when the storefront blocked us and nothing needs fixing. Until the day before Black Friday
the default subject is "Black Friday check on <host>" and the draft opens with the first fix or specific finding
(speed, links, SSL, domain; never app weight). Hosted health links and the email's health document include the
one-pager only for reports that have one, so earlier snapshots, links and JSON backups are unchanged; a tampered
one-pager in a backup is rejected.

## Outreach sign-up path

Hosted outreach links (`/outreach/r/<token>`, health and sample) show a "Check all your client stores" bar above
the report and a panel under it (`components/signup-cta.tsx`, hidden in print). Both go to
`/outreach/r/<token>/start` (public like view and download; `isOutreachReportPath`), which resolves the bundle with
`readStartTarget` (server only: the snapshot id never reaches the page) and redirects to sign-up (`/login?trial=1`)
with two cookies: `sc_store`, the client store (the same cookie the landing-page check sets, on `.storecarehq.com` in
production so it replaces that one; onboarding's store step prefills from it and `addStore` clears it), and, while
the offer is open, `sc_offer` (httpOnly, expires at Black Friday). An unknown, expired or revoked link opens sign-up
without cookies.

The offer (`currentOffer` in `lib/bfcm.ts`, pure; signing in `lib/signup-offer.ts`, server only) is open in the
Black Friday outreach window (60 days before Black Friday until the day before) and ends its trial at noon UTC two
days after Cyber Monday (2 December 2026). The cookie is `v1.<offer>.<snapshot>.<trialEnd>.<expires>.<HMAC>`, signed
with `SIGNUP_OFFER_SECRET` or else `STRIPE_SECRET_KEY` (no key: no offer, and the page doesn't promise one).
`offerFromCookies()` (`lib/signup-offer-cookie.ts`) verifies it for sign-up, workspace, plan and Billing copy and
for Checkout: `checkoutTrial(agency, offerEnd)` returns `trial_end` instead of `trial_period_days: 7` when the offer
ends later than 7 days from now (so a late sign-up keeps 7 days), and never for an agency that subscribed before.
The subscription metadata records `outreach_snapshot` and, when the offer applied, `offer` (attribution in Stripe;
no database column). `billingState` already reads a Stripe trial's end from `current_period_end`. After the
care-plan step an offer sign-up goes to `/bfcm?run=all&welcome=1` and the cookie is cleared; others keep the store page.

The BFCM board waits for a new store's first health check: `runAudit` answers 202 `{ waiting: true }` while the
store's newest `health_check_requests` row is the `initial` one and still queued or running (`firstCheckRunning`,
ignored after 20 minutes), so no one-pager is made from empty monitoring. The board shows "First health check
running…", polls `/api/stores/<id>/health-check` every 5 s for up to 10 minutes, then asks again (or offers a
retry). Demo: `STORECARE_DEMO_FIRST_CHECK=1` gives Kite & Kin a first check that finishes 25 s after the data loads.

- [x] Implement shared shell and DEMO label
- [x] Implement dashboard, report data and interactive store table
- [x] Verify build, tests and responsive browser behavior

Web typecheck and production build passed. Browser review verified search, all/attention/limited filters, empty results, reset, store navigation and mobile width (390px). Existing suites: 47 tests passed; 3 worker checkout tests cancelled because the Playwright browser binary is absent. Database tests require TEST_DATABASE_URL and were skipped. Existing Supabase Edge Runtime build warnings remain.

## App subdomain (approved)
- [x] Implement host routing, app/website links and same-host authentication callbacks.
- [x] Test routing/session boundaries and run production build.
- [x] Add Vercel domain and Supabase callback; deploy app settings and source together.
- [x] Verify live domains and document session behavior.

26 web tests passed, including HTTP integration checks against the running production build.
Web and worker typechecks and production build passed. Vercel accepted the app subdomain;
public HTTPS responds successfully. Supabase Site URL and exact app callback are saved, and
the app-domain alert migration is applied and verified. Vercel's next-deployment app URL is saved.
Production deployment `dpl_AHmF1XYZymMWCTibiA6tJiNq3wDD` is Ready and assigned to both hosts.
Live HTTP checks verified website 200, app root/protected stores redirecting to app login,
legacy website login redirecting to the app with its trial query, and app /welcome returning
to the website. Rendered cross-domain links and the login screen were verified in the browser.
No authenticated user session was available on the new app host: dashboard and logout browser
verification requires the user's first sign-in. Existing session validation and agency/RLS guards
are preserved; authenticated/unauthenticated routing branches are covered by tests.

## Health checks (approved)
- [x] Implement durable requests, permissions, dispatch and automatic initial queueing.
- [x] Implement worker claims, recovery, consent and scheduled-job coordination.
- [x] Implement run button, progress, results and onboarding copy.
- [ ] Verify isolation, concurrency, failures and UI; run typechecks/build.
- [ ] Apply migration, push/deploy, enable dispatch and verify a live manual check.

Pre-rollout: 52 selected worker/database tests and 28 web tests passed; added authenticated-insert
and forced-product-refresh cases also passed with the affected suites. One opt-in host-routing
integration test was skipped because its local server was not running. All workspace typechecks
and the production build passed. Live migration applied with dispatch disabled. Verified status
reads are allowed, lease reads/status writes are denied, and anonymous RPC execution is denied.
The Supabase advisor's new RPC execution warning is intentional (membership/billing-checked);
the private dispatcher state deliberately has deny-all RLS. Existing unrelated findings remain.

## Outreach implementation

### Hosted report links (approved)
- [x] Add isolated immutable snapshot storage and hashed report tokens.
- [x] Add publish/revoke and snapshot-bound approval/send actions.
- [x] Replace email attachments with view links and public downloads.
- [x] Verify role isolation, lifecycle, email payloads, browser views and build.

Hosted-link verification: 115 web tests passed / one existing opt-in host-routing check skipped.
All workspace type checks and production build passed. The isolated local PostgreSQL checks
verified RLS/grants, service-only insertion/revocation, immutable contents, irreversible revocation
and maximum lifetime. Browser checks verified publication, exact email URLs, signed-out views and
HTML downloads, public-data privacy, no-store/noindex/no-referrer headers, sample labels in print,
390px layout, backup restoration and 404s on both view/download routes after revocation.
Production migration `20261102135722_outreach_report_links` applied to StoreCare HQ on 2026-11-02.
Verified live: RLS enabled, no anonymous/authenticated reads, server create/read/revoke allowed,
content updates denied, immutable trigger enabled, and zero report snapshots. Security advisor
comparison shows only the expected new informational [RLS-with-no-policies notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
for this intentionally server-only table; pre-existing warnings are unchanged.
Local migration filename matches the applied remote version. Website deployment remains; no email was sent.

### Resend testing phase (approved)
- [x] Add branded email template and previewable report attachments.
- [x] Add server-signed approval and admin-only test transport.
- [x] Add preview/approve/send controls and sender configuration.
- [x] Verify tests, type checks, production build and browser preview.

Resend testing verification: 111 web tests passed, one existing opt-in routing check skipped.
All workspace type checks and the production build passed. Provider mocks verified actual
recipient/reply-to enforcement, signed-payload approval, edited/expired/tampered rejection,
same-key retries, and failed/unknown acceptance handling. Browser verification checked email,
both report attachment and plain-text previews, real website CTA, demo send blocking, subject
backup restoration and desktop/390px layouts. No real email, production data change or deployment.

- [x] Inspect admin/report boundaries and approved plan.
- [x] Implement prospect imports, exports and factual drafts.
- [x] Implement isolated illustrative monthly reports.
- [x] Build admin preparation and printing interface.
- [x] Run tests, type checks, build and UI verification.
- [x] Document architecture and delivery limits.

Outreach verification: web suite 104 passed / 1 existing opt-in routing check skipped;
all workspace type checks passed; production build passed. Seven new import/export,
draft and sample-report tests pass. Browser checks against the production build in
local demo mode verified manual entry, review gating, sample and print isolation,
390px mobile width, edited-draft backup restore and interrupted-request retry.
The restored-draft textarea label was corrected during browser verification.
No deployment, production data changes, directory collection or emails were performed.

## BFCM readiness audit (approved)
- [x] Review the plan against latest main and live Shopify storefronts; revise it.
- [x] Detect password pages, "Store unavailable", noindex, Googlebot blocks and featured-product stock in the probe.
- [x] Fix the worker logging "apps removed/added" when a store's password page goes on or off.
- [x] Add immutable, shareable `store_audits` with RLS and the `public_audit(token)` client view.
- [x] Build the one-click board (3 stores at a time), branded one-pager, print, client link, note and send.
- [x] Use the one-pager as the outreach hook until the day before Black Friday.
- [x] Verify tests, type checks, RLS, build, demo browser run and live stores.
- [ ] Apply migration `20261105120000_store_audits.sql` to production (owner approval), then deploy.

Verification: storefront 23/23, reports 11/11, web 172 passed / 1 existing opt-in routing check skipped,
worker 75/75 (one run of the full suite hit a teardown race in the untouched health-check-requests file;
it passed alone 3/3 and in a full worker re-run). All workspace type checks and the production build
passed. On local Postgres 16, `rls.test.sql` passed with the new audit section: cross-agency and forged
`created_by` inserts rejected, results immutable, no deletes, paused stores and expired plans can't
audit, anonymous visitors read only shared audits through `public_audit`, tokens under 32 characters fail.
Demo browser run (production build): one click checked 6 stores with progress (3 need fixes, 1 ready
with notes, 1 ready, 1 not fully checked), one-pager printed to 1 page on A4 and Letter, client
link on/off (200 then 404, signed-out 390px view, noindex), mailto + mark as sent, re-check within
2 minutes reused the audit, 0px overflow at 390px, no console errors. Live probes: password and
"Store unavailable" dev stores detected; featured products read on Kith, Allbirds, Brooklinen and
Death Wish Coffee. No production data change, deployment or email.

# Approved dashboard design implementation

Implement the dashboard mockup approved in this chat. Preserve existing monitoring, billing and report workflows.

- [NEW] `apps/web/src/components/icon.tsx`: shared lightweight outline icons.
- [MODIFY] `apps/web/src/app/(app)/layout.tsx`, `nav-links.tsx`: slate navigation, workspace identity, persistent DEMO label and breadcrumb header.
- [MODIFY] `apps/web/src/app/(app)/page.tsx`, `apps/web/src/lib/data.ts`: real dashboard aggregates and report status.
- [NEW] `apps/web/src/components/store-table.tsx`: searchable, filterable store table with status badges and plan usage.
- [MODIFY] `apps/web/src/app/globals.css`: approved colors, typography, responsive shell, metrics, incidents and table.

Verify with web typecheck, production build, existing tests, and desktop/mobile browser review.

## App subdomain separation — proposed 30 October 2026

### Result

- `https://www.storecarehq.com/` always serves the public landing page. The apex keeps redirecting to www.
- Landing-page sign-in and trial links open `https://app.storecarehq.com/login` (with the trial query when appropriate).
- `https://app.storecarehq.com/` validates the Supabase session: returning users see their agency dashboard, new accounts continue onboarding, and signed-out visitors see login.
- Login, registration, recovery, callbacks, onboarding, billing, stores, work and reports stay on the app host. Sessions remain scoped to that host; marketing does not need session cookies.
- Localhost and Vercel preview deployments keep working on their own origin. Existing shared report URLs and Stripe webhook endpoints remain valid during the transition.
- Existing users may need to sign in once on the new app host. Do not copy tokens through URLs or widen cookies to all subdomains.

### Files

- [NEW] `apps/web/src/lib/domains.ts`: explicit production website/app origins, host-aware routing decisions, and local/preview-safe links.
- [NEW] `apps/web/src/lib/domains.test.ts`: verify public/app routing, signed-in/out entry behavior, legacy URLs, query preservation, preview handling and untrusted-host rejection.
- [MODIFY] `apps/web/src/middleware.ts`: resolve the production host before auth, serve marketing independently, route legacy app GET URLs to the app host, preserve refreshed session cookies, and send signed-out app entry to login. Do not forward old-host POST bodies or server actions across origins.
- [MODIFY] `apps/web/src/app/welcome/page.tsx`: point sign-in and trial links directly at the app origin.
- [MODIFY] `apps/web/src/components/auth-shell.tsx`: point marketing/home links at the public website in production.
- [MODIFY] `apps/web/src/app/auth/password-actions.ts`: resolve callbacks consistently for production app and local/preview origins, keeping recovery intent and PKCE on the same host.
- [MODIFY] `.github/workflows/monitor.yml`, `apps/worker/src/tasks.ts`: use the app origin for monitoring/report links.
- [NEW] Supabase migration generated with the CLI: update newly queued alert links to `https://app.storecarehq.com/stores/`, preserving trigger permissions and behavior.
- [MODIFY] `apps/web/.env.example`, `apps/worker/.env.example`, `README.md`, `supabase/templates/README.md`: document both domains, session boundaries, callback settings and rollout steps.
- [MODIFY] `task.md`: track implementation and validation after approval.
- [NEW] `system_architecture.md`: record the host routing and authentication design after implementation.

### Hosted configuration and rollout

1. Add `app.storecarehq.com` to the existing Vercel project and verify DNS/HTTPS.
2. Add the exact `https://app.storecarehq.com/auth/callback` URL in Supabase and set its Site URL to `https://app.storecarehq.com`, retaining the existing allowed callbacks for in-flight links and local development.
3. Set Vercel Production `NEXT_PUBLIC_APP_URL=https://app.storecarehq.com`; use an explicit public website origin in code/config. Leave local environment URLs local.
4. Apply the alert-link migration; deploy the reviewed source and settings together so website/app routing switches atomically. Do not deploy the app URL environment change against the old routing code alone.
5. Keep existing Resend credentials and sending domains unchanged.

### Validation

Run web tests, worker typecheck, web typecheck and production build. Verify marketing stays public, app entry redirects signed-out users to login, existing app sessions reach the dashboard, login/recovery callbacks stay on the app host, logout clears the app session, onboarding/billing guards still work, shared report links and webhook routes remain usable, and localhost is unaffected. Authenticated browser verification requires an available user session; do not change a password or send test emails without the corresponding user authorization.

## Automatic first scan and manual health checks — proposed 30 October 2026

### Product behavior

- Adding a store atomically queues its first health check. Dispatch the existing GitHub worker promptly instead of waiting for its regular 30-minute schedule.
- Add **Run health check** beside Settings/Log time on the store page. It queues a scan for that store only, with visible queued/running/completed/partial/failed status, current phase, timestamps and retry guidance.
- Run uptime, storefront snapshot, mobile speed and site checks (certificate, domain and links). Run checkout only with existing consent and a usable snapshot/product. Do not draft monthly reports as part of a manual health check.
- Preserve existing health-score calculations, monitoring history and incident/alert handling. The first snapshot establishes a baseline; change detection needs a later snapshot.
- Deduplicate repeated clicks, allow one pending/running scan per store, and enforce a five-minute cooldown in the database. Paused stores and agencies without monitoring access cannot request scans.
- Keep the request durable if dispatch fails or GitHub is slow. The existing scheduled worker can pick it up. Show queued status honestly; do not promise immediate completion or show success before checks finish.
- Automatically refresh scan progress while queued/running, then refresh the displayed metrics on completion. Provide a clear partial result when a provider such as PageSpeed is unavailable.

### Implementation

- [NEW] CLI-generated Supabase migration: `health_check_requests` with agency-scoped read access; constrained statuses, attempt/lease bookkeeping and per-phase results; a protected request RPC that checks membership, billing, paused state, deduplication and cooldown; an insert trigger that queues initial scans atomically with store creation. Users cannot write worker status or read dispatch credentials.
- [MODIFY] `scripts/setup-monitor-scheduler.sql`: reuse the private `storecare_ops.dispatch_monitor()` and its existing Vault credential through a narrowly scoped internal dispatch path. No GitHub token goes into the web app. Throttle dispatch requests and keep durable requests available to scheduled runs.
- [NEW] `apps/worker/src/health-check-requests.ts`: claim requests with a lease, run checks in dependency order, save per-check status, record final outcome, recover abandoned leases with bounded retries, and skip stores that became ineligible.
- [MODIFY] `apps/worker/src/tick.ts`, `apps/worker/src/index.ts`: process requested scans through both worker modes, coordinate execution to avoid overlapping scans, and let normal due-job logic use the resulting fresh timestamps.
- [NEW] `apps/web/src/app/(app)/stores/[id]/health-check-actions.ts`: authenticated request action using the user-scoped Supabase client; render useful request/cooldown errors without exposing provider responses.
- [NEW] `apps/web/src/components/health-check-status.tsx`: run button and accessible progress panel; poll only active requests, stop on completion and refresh metrics.
- [MODIFY] `apps/web/src/app/(app)/stores/[id]/page.tsx`, `apps/web/src/app/globals.css`: place the run control, display latest scan progress/results and show a waiting-for-first-scan state.
- [MODIFY] `apps/web/src/app/onboarding/plan/page.tsx` and relevant onboarding success copy: explain the queued first scan and baseline behavior without claiming a completed check.
- [NEW/MODIFY] Worker unit/database tests and web action tests: agency isolation, initial queue creation, duplicate/cooldown races, consent, partial failures, abandoned leases, paused/access changes, and preservation of scheduled monitoring behavior.
- [MODIFY] `docs/monitoring-operations.md`, `system_architecture.md`, `task.md`: document dispatch, timing, retries, permissions, rollout and checks.

### Rollout and verification

Inspect the live scheduler function and table policies before finalizing the migration. Test queue/RPC security against an isolated database and run relevant worker/web tests, typechecks and the production build. Deploy worker support before enabling live request dispatch/UI; apply the migration and private dispatch wiring, then deploy the app. Verify one user-authorized scan of an existing store through the real button and confirm queued → running → final status, updated monitoring timestamps, and duplicate-click protection. Preserve existing stores and do not manufacture incidents or send client reports to test the feature.

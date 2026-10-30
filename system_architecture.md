# Website and app domains

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

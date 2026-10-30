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

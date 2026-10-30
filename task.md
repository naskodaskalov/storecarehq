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

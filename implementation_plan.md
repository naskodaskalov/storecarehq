# BFCM readiness audit

Status: proposed. No code, data or emails changed yet.

## Outcome

One click on a new **BFCM audit** page checks every client store and produces a branded one-page
"Black Friday readiness" sheet per store (agency logo, colour, name). The agency saves it as PDF or turns
on a client link. The same one-pager becomes the outreach hook for prospect agencies (part 2).
Black Friday 27 Nov, Cyber Monday 30 Nov (computed: day after the fourth Thursday of November).

## Existing behavior verified

- Monitoring already stores what most checks need: daily speed (`speed_samples`), checkout runs, uptime,
  daily SSL/domain/broken links (`site_checks`), hourly theme/apps and a daily product feed with stock.
- `quick-report.ts` runs live public checks for any URL (probe, SSL, RDAP, links, PageSpeed); nothing saved.
- `ReportView` + browser print is the PDF path; `/r/<token>` (public, noindex) is the client-link pattern.
- Nothing checks password mode or noindex today (backlog item 2). A password page may even look "blocked".
- Shopify's default robots.txt disallows `/collections/*sort_by*`, and sales need store access, so true
  "best sellers" are not readable. Proxy: **products featured on the home page** (what the store promotes).

## Decisions (defaults; say if you want otherwise)

1. In-app audit = latest monitoring data + a light live pass at click time (robots.txt, home page,
   up to 3 featured product pages; ~5 polite requests per store as StoreCareBot). No PageSpeed or checkout
   run at click time: stale or missing data is shown with its date or as "not checked", never as a failure.
2. Runs 2 stores at a time from the browser, one server action per store, with per-row progress.
   A store audited in the last 2 minutes returns that audit instead of re-checking. Paused stores are skipped.
3. Each run is saved (`store_audits`). The client link is off until the agency turns it on; can be turned off.
4. PDF = browser print, laid out to fit one A4/Letter page. No new dependencies.

## What the one-pager checks

| Check | Source (app) | Fix before BF | Worth a look |
| --- | --- | --- | --- |
| Store open to shoppers | live home page | password page on | — |
| Google can index it | live home + robots.txt | noindex on home, or Googlebot blocked from `/` | noindex on a featured product |
| Checkout works | checkout runs, 48h | last run failed | not enabled → "turn it on before the sale" (not checked) |
| Store up | incidents, uptime 30d | open "down" incident | uptime under 99.5% |
| Mobile speed | latest speed sample (≤3 days) | — | LCP over 4s, score under 50, or real visitors "poor" |
| Featured products | live home links + product snapshot | linked product returns 404 | featured product sold out |
| Links | latest site check (≤3 days) | — | any broken link |
| SSL certificate | latest site check | expired | 14 days or less left |
| Domain | latest site check | expires before 7 Dec | 45 days or less left |
| App weight | latest snapshot + live scripts | — | 12+ apps or 3+ unknown script hosts |
| Recent changes | changes, 14 days | — | theme published / apps added → test and freeze |

Verdict: "N things to fix before Black Friday" / "Ready · N worth a look" / "Ready for Black Friday", plus a
countdown, a short fix list, check dates, and "Prepared by <agency> · public storefront checks, no store access".

## Part 1: in the app

- [NEW] `packages/storefront/src/states.ts` — pure detectors: password page (final URL `/password` or its
  form, whatever the status code), noindex (meta + `X-Robots-Tag`), robots blocks Googlebot, featured product handles.
- [MODIFY] `packages/storefront/src/index.ts` — export them; [MODIFY] `packages/storefront/test/storefront.test.ts` — fixtures.
- [NEW] `apps/web/src/lib/bfcm.ts` — sale dates/countdown, audit types, `buildBfcmAudit()` (pure), `liveBfcmChecks()`.
- [NEW] `apps/web/src/lib/bfcm.test.ts` — thresholds, unknown/stale data, blocked store, password page, dates, verdict.
- [NEW] `apps/web/src/lib/bfcm-data.ts` — loads one store's latest monitoring rows as the signed-in user (RLS).
- [NEW] `supabase/migrations/20261104000001_store_audits.sql` — `store_audits` (agency-scoped RLS; members read/insert,
  update only `shared_at`; store must belong to the agency; size cap) and `public_audit(token)` (shared audits only).
- [MODIFY] `supabase/tests/rls.test.sql` — cross-agency isolation, insert check, share gating, anonymous token read.
- [NEW] `apps/web/src/components/bfcm-audit-view.tsx` — the branded one-pager (app, client link, admin).
- [MODIFY] `apps/web/src/app/globals.css` — one-pager styles, one-page print layout, 390px layout.
- [NEW] `apps/web/src/app/(app)/bfcm/page.tsx`, `bfcm-board.tsx`, `actions.ts` — store list with latest audit,
  "Run on all N stores", per-row spinner/queued/failed/retry (visible loading feedback throughout), plan access check.
- [NEW] `apps/web/src/app/(app)/bfcm/[id]/page.tsx` — one-pager, Save as PDF, client link on/off, run again.
- [NEW] `apps/web/src/app/r/audit/[token]/page.tsx` — client view, no login, noindex (already public under `/r/`).
- [MODIFY] `apps/web/src/app/(app)/nav-links.tsx` — "BFCM audit" nav item.
- [MODIFY] `apps/web/src/app/(app)/page.tsx` — countdown banner with the one-click button until Cyber Monday.
- [MODIFY] `apps/web/src/lib/demo.ts` — audits table, `public_audit`, canned live results (one store in password
  mode, a sold-out featured product, an expiring domain) so the demo and videos show a real-looking audit.
- [MODIFY] `apps/web/src/lib/workspace-data.ts` — include audits in the workspace export.

## Part 2: outreach hook (after part 1)

- [MODIFY] `apps/web/src/lib/quick-report.ts` — reuse the robots/home responses it already fetches; add `bfcm` to the report.
- [MODIFY] `apps/web/src/app/admin/quick-report/quick-report-form.tsx` — "BFCM one-pager" view and print.
- [MODIFY] `apps/web/src/lib/outreach.ts` — validate optional `bfcm` in backups; before Cyber Monday the draft opens
  with the Black Friday finding ("23 days to Black Friday: …").
- [MODIFY] `apps/web/src/lib/outreach-email.ts` — subject "Black Friday check on <store>" before Cyber Monday;
  the health document becomes the one-pager. Old backups and links keep working.
- [MODIFY] `apps/web/src/app/outreach/r/[token]/page.tsx` — render the one-pager for BFCM snapshots.
- [MODIFY] `quick-report.test.ts`, `outreach.test.ts`, `outreach-email.test.ts`.
- For prospects: checkout shows "not tested (needs the owner's OK)"; uptime/recent changes "not monitored yet".

## Verification

- `npm run typecheck`, `npm test`, web production build; RLS SQL test on a local Postgres.
- Demo mode in the browser: run all 6 stores, progress states, one-pager at desktop and 390px, print preview is
  one page, link on/off, signed-out client view, 404 after turning the link off.
- Live: this sandbox can't reach stores, so a real-store pass needs you (any Shopify development store is
  password-protected by default, a good password-mode test).

## Rollout (needs your go-ahead)

- Apply the migration to StoreCare HQ (additive) before deploying.
- This session can read the repo but not push yet: approve and I'll request push access and open a PR,
  or hand you a patch.
- [MODIFY] `system_architecture.md`, `task.md` after the build.

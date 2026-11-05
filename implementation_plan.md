# BFCM readiness audit

Status: approved 5 Nov 2026, revised after review against main (28e1edd) and live Shopify checks.

## Outcome

One click on **BFCM audit** checks every client store and produces a branded one-page
"Black Friday readiness" sheet per store (agency logo, colour, name). The agency saves it as PDF, turns on a
client link, or sends it to the client by email. The same one-pager becomes the outreach hook for prospect
agencies. Black Friday 27 Nov, Cyber Monday 30 Nov (day after the fourth Thursday of November).

## Review findings (live checks, 5 Nov)

- Password page: `/` redirects to `/password`, which answers **200** (not 401) with `Server-Timing: pageType;desc="password"`,
  `X-Robots-Tag: nofollow` and `<form action="/password" id="login_form">`. Today the landing scan calls such a store
  "headless" when the password page has no theme block. `/products.json` and `/products/<handle>.js` answer 401 there,
  which `looksBlocked` reads as a bot block.
- Worker bug found: the hourly snapshot treats the 200 password page as a readable home page, so turning the password
  page on logs "apps removed" (the password page loads none) and sets "limited: no product feed"; turning it off logs
  "apps added". Fixed here by skipping snapshots of password and "Store unavailable" pages.
- "Store unavailable" (closed or frozen store): 404 with title "Store unavailable".
- `/products/<handle>.js` returns JSON with `available`; 404 when the product is gone. Reliable stock check for the
  products the home page promotes. Best sellers stay unreadable: the 2026 default robots.txt still disallows `sort_by`.
- Product links on real home pages: plain hrefs (Kith, Death Wish, Taylor Stitch), Alpine `:href` expressions (Allbirds),
  or only JSON menu data (Brooklinen). Extraction scans `/products/<handle>` paths, `<main>` first, not only `href="…"`.

## Design changes from the first plan

1. Detectors run inside `probeStore` (it already fetches robots.txt and the home page), so the landing scan, theme
   detector, quick report and worker all get password / unavailable / noindex states without extra requests.
   The audit's live pass is a probe without feed and cart plus up to 3 product JSON requests.
2. Added **Send to client** (Resend when configured, otherwise mailto + mark as sent) and a short agency note on the
   one-pager: sending is the step after the audit.
3. Each audit is an immutable, dated snapshot with its own link (off until shared). Re-running makes a new one-pager.
4. 3 stores at a time (different hosts), 10 s per request, a store re-checked within 2 minutes reuses its audit.
   Each store is one `POST /api/bfcm/<id>` (same-origin only): Next.js runs a page's server actions one at a time,
   so actions could not check stores in parallel.
5. A fourth verdict, **Not fully checked** (`partial`): when the storefront could not be loaded (firewall, timeout,
   error) and nothing needs fixing, the store is never called ready on checks that did not run. Failed checks carry
   no email phrase, so they never become a claim in an email.

## Checks

| Check | Source | Fix before BF | Worth a look | Not checked |
| --- | --- | --- | --- | --- |
| Open to shoppers | live home | password page, "Store unavailable", open down incident | home error now | firewall blocked |
| Google can index | live home + robots.txt | noindex (meta or header), Googlebot blocked from `/` | — | home unreadable |
| Checkout | checkout runs 48h | latest run failed | — | test off / no recent run |
| Uptime | incidents, 30 days | — | under 99.5% | no checks |
| Mobile speed | latest sample ≤3 days | — | LCP > 4 s, score < 50, real visitors poor | stale |
| Featured products | live `/products/<h>.js` (≤3) | gone (404) or sold out | — | none linked / blocked |
| Links | site check ≤3 days | — | broken links | stale |
| SSL | site check, else live | expired or expires before Cyber Monday | ≤14 days | unreadable |
| Domain | site check, else live RDAP | expires before 7 Dec | ≤45 days | not published |
| App weight | live home scripts | — | 12+ apps or 3+ unknown hosts | home unreadable |
| Recent changes | changes, 14 days | — | theme published / apps added | — |

Prospect one-pagers (outreach) use the quick report's live data; checkout, uptime and recent changes show as not checked.

## Files

- `packages/storefront/src/states.ts` [NEW]: `readPageState`, `productHandles`, `checkProducts`; `probe.ts` adds `page` + `timeoutMs`.
- `apps/worker/src/jobs/storefront.ts`: skip snapshots of password/unavailable pages (+ test).
- `apps/web/src/lib/bfcm.ts` [NEW]: dates, types, pure `buildBfcmAudit`, `prospectAudit`; `bfcm-data.ts` [NEW]: RLS loads,
  live pass, demo results; `bfcm-email.ts` [NEW]; tests.
- `supabase/migrations/20261105120000_store_audits.sql` [NEW]: table, RLS (members read/insert, update only note/share/sent
  fields, store must belong to the agency, active plan), `public_audit(token)`; `supabase/tests/rls.test.sql`.
- UI: `components/bfcm-one-pager.tsx`, `app/(app)/bfcm/{page,bfcm-board,actions}.tsx`, `app/(app)/bfcm/[id]/page.tsx`,
  `app/r/audit/[token]/page.tsx`, nav item (in season), Overview banner, print CSS (one A4/Letter page), demo data.
- Outreach: quick report adds `bfcm`; until the day before Black Friday the subject is "Black Friday check on <host>",
  the draft opens with the readiness finding, and the hosted health link renders the one-pager. Only a fix or a specific
  finding (speed, links, SSL, domain) opens the email, never app weight; a prospect whose storefront blocked us gets the
  plain health check instead of a "Not fully checked" one-pager. Old backups and links keep working.

## Verification

Typecheck, unit tests, web build, RLS + worker DB tests on local Postgres 16, demo mode in a browser at desktop and 390 px
(run all, progress, one-pager, print preview, link on/off, signed-out client view), and the live pass against real stores
(a password-protected dev store, a store with sold-out/missing featured products).

## Rollout (needs the owner)

Apply the migration (additive) before deploying the web app. Worker change ships with the merge to main.

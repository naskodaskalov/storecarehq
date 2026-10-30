# StoreCare HQ

Care-plan monitoring and monthly client reports for Shopify agencies.
Phase 1 is **storefront-first**: an agency adds a client store by its URL, and StoreCare watches the public
storefront. No Shopify app, no client approval.

## What's here

| Path | What it is |
| --- | --- |
| `packages/storefront` | Reads a public storefront as `StoreCareBot`: robots.txt, theme ID/name/version, app scripts, `/products.json`, and diffs snapshots into change-feed entries. No dependencies. |
| `apps/worker` | Background jobs on pg-boss: hourly storefront diff, 5-minute uptime, daily checkout test (Playwright), daily speed (PageSpeed Insights), alerts (email via Resend, Slack), health score. |
| `apps/web` | Next.js app on Supabase: magic-link sign-in, onboarding (workspace → add store URL → care plan), dashboard, store page with change feed, work log. |
| `supabase/migrations` | Postgres schema with row-level security per agency. |
| `scripts/probe-stores.ts` | The phase 1 check: what can we see on a list of real stores? Results in [`docs/storefront-check.md`](docs/storefront-check.md). |

Not built yet: the monthly report pipeline (draft → approve → PDF → email), branding settings, client request inbox,
billing. The Shopify connector is phase 2.

## Run it locally

Needs Node 22.18+ (TypeScript runs natively, no build step for the worker).

```bash
npm install
npm test                                  # storefront + worker unit tests
node scripts/probe-stores.ts mystore.com  # try the storefront check on any store
```

Database tests need a Postgres server (any local one works; nothing Supabase-specific):

```bash
TEST_DATABASE_URL=postgresql://postgres@localhost:5432/postgres npm test
```

### Demo mode (no Supabase needed)

```bash
STORECARE_DEMO=1 NEXT_PUBLIC_SUPABASE_URL=https://demo.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=demo \
  npm run dev --workspace @storecare/web
```

Signs you in as a sample agency (Northline Studio, 6 client stores) with in-memory data from
`apps/web/src/lib/demo.ts`. The "Check store" step in onboarding still reads the real storefront you type in.
Good for reviewing the UI and for showing the product to agencies.

### Against a real Supabase project

1. Create a Supabase project (EU region). In **SQL editor**, run `supabase/migrations/20261027000001_init.sql`
   (or `supabase db push` with the CLI).
2. **Authentication → URL configuration:** set Site URL to your app URL and add `<app-url>/auth/callback` as a redirect URL.
3. Web app: copy `apps/web/.env.example` to `apps/web/.env.local`, fill in the project URL and anon key, then
   `npm run dev --workspace @storecare/web`.
4. Worker: copy `apps/worker/.env.example` to `apps/worker/.env`, fill in the database connection string and a
   PageSpeed API key, then `node --env-file=apps/worker/.env apps/worker/src/index.ts`.
   To run one job for one store: `node --env-file=apps/worker/.env apps/worker/src/run-once.ts storefront <store-id>`.

## Deploy

### Website and app domains

The public site is `https://www.storecarehq.com`; the agency application is
`https://app.storecarehq.com`. Both point to the same Vercel project. Marketing sign-in and trial
buttons navigate directly to the app host. Opening the app checks the Supabase session and shows
the user's workspace or login; accounts without an agency continue onboarding.

Set Vercel Production `NEXT_PUBLIC_APP_URL=https://app.storecarehq.com`, Supabase Site URL to
the same origin, and allow `https://app.storecarehq.com/auth/callback`. Keep existing old-domain
and local callbacks during migration. Worker `APP_URL` also points to the app. Deploy these settings
with the host-routing code. Local `.env.local` URLs must remain local.

Sessions stay on the app host. Existing website sessions require one sign-in on the new host.
Previously shared report links and Stripe webhooks remain valid on the old domain. See
[domain architecture](system_architecture.md) for routing rules and verification.

### Services

- **Web:** Vercel, root `apps/web`, same env vars as `.env.example`.
- **Worker (current): GitHub Actions.** `.github/workflows/monitor.yml` requests a run of `apps/worker/src/tick.ts` every
  30 minutes. GitHub's scheduled triggers are best effort and can be delayed or dropped; this is not a guaranteed monitoring interval.
  Each actual run performs uptime checks, a storefront snapshot about hourly, checkout test, speed and site checks once a day
  after 06:00 store time, and last month's report drafts from 06:00 on the 1st (catching up until the 5th; an
  existing report is never touched), followed by one "ready to review" message per agency. Needs repository
  secrets `DATABASE_URL` (required) and `PAGESPEED_API_KEY`, optionally `DATABASE_CA_CERT`, `RESEND_API_KEY` and
  `ANTHROPIC_API_KEY` (AI-written report summaries). Run it by hand from the Actions tab ("Monitor stores" → Run
  workflow); the "force" box runs `storefront`, `speed`, `site` or `report` straight away.
  Missing database configuration fails the workflow. Individual store failures are isolated and logged as they finish;
  database connections time out after 15 seconds and statements after 60 seconds. See [monitoring operations](docs/monitoring-operations.md).
- **Worker (later, always-on):** any container host: `docker build -f apps/worker/Dockerfile .`, one instance,
  runs `src/index.ts` with pg-boss for 5-minute uptime checks. Env vars from `apps/worker/.env.example`.

## Rules the code follows

- Every request identifies as `StoreCareBot`; we never disguise the client to get past a bot check. A bot check
  is recorded as *blocked*, never as *down*, and a store only becomes "limited" after 3 blocked visits in a row.
- Page and product-feed reads respect robots.txt. The checkout test runs only when the agency has confirmed it
  looks after the store and the client agrees to a daily test visit, and it never types into the checkout.
- Changes are *detected*, not attributed. A change is linked to the agency's work-log entry when one explains it.

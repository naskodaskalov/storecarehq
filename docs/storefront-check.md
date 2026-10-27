# Phase 1 storefront check — results

Run on 27 Oct 2026 with `node scripts/probe-stores.ts --file scripts/stores.sample.txt`, as `StoreCareBot`,
one request per second per store, respecting robots.txt.

## Summary (16 public Shopify stores)

| Signal | Visible on | Notes |
| --- | --- | --- |
| Home page readable | 15 / 16 | bombas.com answers the bot with Shopify's "Verifying your connection" page (HTTP 429) |
| Theme ID and name | 12 / 16 | From `Shopify.theme` in the page source |
| Theme version | 12 / 16 | `schema_version` is there too, so "theme is N versions behind" *is* possible for theme-store themes |
| `/products.json` | 12 / 16 | 3 stores return 404 |
| Apps detected | 13 / 16 | Script hosts, Shopify's script-tag loader and theme app extensions |

The 3 stores with no theme and no product feed (chubbiesshorts.com, ruggable.com, blueland.com) serve
their storefront from a custom headless frontend, not a Shopify theme. Those are large brands with in-house
teams; StoreCare's target agencies mostly look after theme-based stores, where every signal was visible.

## What this means for the build

1. **Phase 1 is viable.** For theme-based stores we get theme publishes, theme version, product and price
   changes, and app adds/removals without any Shopify access.
2. **Onboarding must say what we can see.** When a store is headless or blocks the bot, show
   "limited monitoring" with the reason, and still run uptime and speed.
3. **App names:** theme app extension URLs carry the app's handle
   (`/extensions/<uuid>/rivo-loyalty-rewards-referrals-832/assets/...`), so most apps get a readable name.
   The uuid changes on every app release, so apps are keyed by handle; a changed version number is a
   possible "app updated" signal.
4. **Decision needed: the checkout test and robots.txt.** Shopify's default robots.txt disallows `/cart`
   and `/checkout` for all crawlers, so `/cart.js` was skipped on 15 of 16 stores. The checkout test is not
   crawling: it is synthetic monitoring the agency runs on a store it is paid to look after, like an uptime
   check. Proposed rule: the agency confirms at onboarding that it manages the store and that the client
   agrees to a daily test visit; only then does the checkout test run, still identified as StoreCareBot.
   Crawling-style reads (home page, product feed) keep respecting robots.txt.
5. **Bot challenges are a real case** (1 of 16). Record them as "blocked", never as "down", and never
   disguise the bot to get past them. The agency can ask the client to allow StoreCareBot.

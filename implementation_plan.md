# Outreach sign-up path (BFCM step 2)

Status: approved 5 Nov 2026 (trial until 2 December), built. The previous plan is in `bfcm_audit_plan.md`.

## Outcome

An agency that opens its Black Friday one-pager from an outreach email clicks **Check all your client stores**, signs
up with that client store already filled in, and ends on the BFCM page, where the check runs by itself. Sign-ups from
an outreach link until Black Friday get a trial that ends on **2 December** instead of after 7 days.

## Flow

1. **Hosted one-pager** (`/outreach/r/<token>`): a "Check all your client stores" button in the top bar and a short
   panel under the one-pager: one page per store in your branding, ready to send before the sale; the client store is
   filled in; "Free until 2 December, then from $29 a month. Card required, cancel any time." From Black Friday on it
   reads "Start your free trial" with the usual 7 days. Hidden when printing. The sample monthly report gets the panel too.
2. **`GET /outreach/r/<token>/start`** (public like the view and download routes; checks the link is still live):
   sets `sc_store` to the client store (the cookie the landing-page check already uses to prefill onboarding) and,
   until Black Friday, `sc_offer`: a signed, expiring offer (httpOnly). Redirects to sign-up (`/login?trial=1`), which
   shows the offer. A signed-in visitor goes to their workspace as today.
3. **Sign-up → workspace → plan**: the plan step says "Nothing is charged until 2 December". Checkout gets
   `trial_end` = 2 Dec 12:00 UTC (a 2 December charge from the US to Australia) instead of 7 days, and the Stripe
   subscription metadata records the offer and the outreach snapshot (attribution). Whichever is longer wins, so a
   sign-up close to Black Friday still gets 7 days. Only an agency's first plan, as today.
4. **Store step**: prefilled (existing). After the store is added, `sc_store` is cleared, so "add another store" starts empty.
5. **Care plan step** → `/bfcm?run=all&welcome=1` for offer sign-ups (others keep the store page). A welcome notice says
   the store's first health check takes a few minutes and invites them to add their other client stores meanwhile.
6. **BFCM board**: a store whose first health check is still running shows "First health check running…" and its
   Black Friday check starts as soon as that finishes (polls the existing status endpoint; after 10 minutes it stops
   with a Retry). The server refuses to audit such a store: a one-pager made a minute after adding a store would show
   speed, links, checkout and uptime as "not checked".

## Choices

- **Signed cookie, not a public promo code**: only people with an outreach link get the longer trial. It survives email
  confirmation because confirmation already has to happen in the same browser (PKCE). Signed with `STRIPE_SECRET_KEY`
  (or `SIGNUP_OFFER_SECRET` if set); without Stripe there is no offer. No new required env var.
- **No migration**: attribution goes to Stripe metadata; outreach history is unchanged.
- **Draft email**: the Black Friday draft's closing changes from "I'm setting up the first agencies free" to "There's a
  button on the one-pager to run it on your other client stores, free until 2 December. Or reply and I'll set it up
  with you."

## Files

- `apps/web/src/lib/signup-offer.ts` [NEW] + test: offer window and trial end from `saleDates`, sign/verify, cookie options.
- `apps/web/src/app/outreach/r/[token]/start/route.ts` [NEW]: the button's target (step 2).
- `apps/web/src/components/signup-cta.tsx` [NEW]: the panel and the top-bar button.
- `apps/web/src/app/outreach/r/[token]/page.tsx` [MODIFY]: render them.
- `apps/web/src/lib/outreach-report-links.ts` [MODIFY]: `readStartTarget(token)`, the client store for either token.
- `apps/web/src/lib/domains.ts` [MODIFY] + test: `/outreach/r/<token>/start` is public.
- `apps/web/src/lib/billing.ts` [MODIFY] + test: `checkoutTrial(agency, offerEnd, now)`, the charge date.
- `apps/web/src/app/(app)/billing/actions.ts` [MODIFY]: offer → `trial_end` and metadata.
- `apps/web/src/app/login/page.tsx`, `onboarding/page.tsx`, `onboarding/trial/page.tsx`, `(app)/billing/page.tsx` [MODIFY]: offer copy.
- `apps/web/src/app/onboarding/actions.ts` [MODIFY]: clear `sc_store` after adding; offer sign-ups finish on `/bfcm`.
- `apps/web/src/lib/bfcm-run.ts`, `(app)/bfcm/bfcm-board.tsx`, `(app)/bfcm/page.tsx` [MODIFY]: first-health-check wait, welcome notice.
- `apps/web/src/lib/outreach.ts` [MODIFY] + test: the draft's closing.
- `apps/web/src/app/(legal)/privacy/page.tsx` [MODIFY]: list the `sc_offer` cookie.
- `apps/web/src/lib/demo.ts` [MODIFY]: an opt-in demo store with a first health check in progress, for browser checks.

## Verification

Unit tests (offer signing: tampered, expired, other key; trial parameters by date; public routes; draft copy),
typecheck, build, and a demo browser run at desktop and 390 px: hosted link → button → cookies and the sign-up page
with the offer; plan step copy; the board's first-health-check state, then the one-pager.

## Rollout

Merge = deploy. No migration, no new required env var.

## Decision

Trial end **2 December** (charge that day) for sign-ups from outreach links until the day before Black Friday.
Approved 5 Nov.

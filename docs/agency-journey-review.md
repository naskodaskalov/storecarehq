# Agency journey review — 30 October 2026

This pass traced registration → workspace → trial → store → care plan/alerts → monthly
report → approval → sharing/sending. It combines source review, automated failure/concurrency
checks and read-only live data checks. It is not a completed live user-acceptance session.

## Fixed locally

- Report save and approval are one conditional database write. Failed writes cannot report
  success or approve content that was not saved.
- Draft save, refresh and reopen use revision checks. Stale tabs cannot overwrite newer work
  or refresh a report that another tab approved. Save-only does not publish the client link.
- Failed monitoring/work-log queries stop report generation instead of producing an apparently
  empty month. Provider errors are shown without leaking response bodies.
- Report sending times out after 15 seconds. If the provider accepts the message but the
  status save fails, the user is told to check delivery before sending again. Manual send
  status writes also check the database result.
- Onboarding validates store/client addresses, care-plan hours, Slack URLs and checkout device
  selection. It no longer continues silently after failed plan/device/alert writes.
- A partially created store can finish its care plan on the next step. Saving the care plan
  repairs a missing plan row. Retrying the same Slack destination does not duplicate it.
- Email-route detection now checks agency-wide email routes, rather than counting unrelated
  Slack routes. Plan completion retries missing incident-email setup.
- The care-plan step shows saved values on retry, reports failures, and blocks submission
  if saved plan data could not be loaded. Store settings also require a checkout device
  when checkout consent is enabled.

## Verified

20 web tests pass, including six report write/concurrency cases and a failed-source-read case;
the production build and typecheck pass. Report tests use a modeled conditional database
adapter; they do not prove a live provider accepted a client email.

Read-only checks against the connected Supabase project at 10:40 UTC found two stores,
no missing care plans, no agencies with stores missing an agency-wide email route, no consented
checkout configuration without devices, and no eligible stores missing uptime checks for
75 minutes. One report exists. No client reports were sent or real customer data edited.

## Still needed before an agency pilot

1. Commit/deploy the pending app and worker changes. Supabase auth SMTP/templates and previous
   database migrations are live, but local source changes are not automatically deployed.
2. Configure application email independently of Supabase Auth SMTP. The local web environment
   has neither `RESEND_API_KEY` nor `REPORTS_FROM`; the report page therefore offers its manual
   email-app route. Auth SMTP working does not enable client reports or monitoring emails.
   A verified sender and a suitably restricted key are needed in the relevant app/worker
   environments. The temporary verified domain is `naskodaskalov.dev`.
3. Complete a real browser acceptance journey with the owner: new verified account, sandbox
   Checkout, store setup, work entry, report save/approve, public client link and chosen report
   delivery. No payment, new account password or client-email send was performed in this pass.
4. Direct report delivery still needs durable delivery records/idempotency to handle ambiguous
   timeouts safely. Current failure copy warns users to check delivery before resending.
5. Onboarding writes now fail visibly and can be retried; creating store, plan and routes is
   still multiple writes rather than one database transaction. A transactional onboarding RPC
   is a further hardening option for repeated failures/concurrent requests.
6. Independent operator notifications for stale monitoring remain separate from agency alerts;
   the existing Supabase health check records failures in Cron history.

The next practical blocker is application-email configuration, followed by the owner-led
acceptance journey. Auth email templates do not need to be rebuilt for that work.

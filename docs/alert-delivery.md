# Alert delivery

Email and Slack messages are saved in `public.alert_deliveries` before any provider request.
Downtime, checkout incidents (including recovery), and risky changes use database triggers so
their event and alert commit or roll back together. Each updated worker database connection
opts in via `storecare.alert_outbox=on`; pg-pool's awaited connection hook sets it before jobs
can run. Older deployed workers retain the previous path until the updated code is deployed.
`notify` filters routes by severity; monthly report digests use the same queue. SMS remains
unsupported and is not marked sent. Existing historical incidents are not backfilled or emailed.

## Delivery and retries

The worker attempts new messages immediately, drains pending deliveries at the start/end
of each GitHub tick, and drains every five minutes in the persistent pg-boss worker.
Failures retry after 5, 15, 60, 180 and 360 minutes, on the next available worker run.
GitHub/Supabase currently ticks every 30 minutes, so a five-minute retry is not a five-minute promise.
There are at most six automatic attempts. Invalid recipients/webhooks stop earlier; missing
configuration and temporary provider/network failures retry. Both transports time out after 15 seconds.
Provider response bodies and raw fetch errors are never saved or logged.

Claims use `FOR UPDATE SKIP LOCKED` and a five-minute lease with a unique token. A crashed
worker's lease can be recovered, and stale workers cannot acknowledge newer claims. Event keys
deduplicate route overlap and repeated event submission. Removed/changed routes cancel old queued
messages; saving an unchanged Slack route preserves its ID.

Email requests use Resend idempotency keys based on the delivery UUID. Automatic delivery stops
after 23 hours to stay inside Resend's 24-hour deduplication window. Slack does not support the same
guarantee: a crash after Slack accepts a message but before the database acknowledgement can cause
a duplicate on retry. Explicit manual retries create a new message/key, so they can also duplicate
a message that the provider accepted before a timeout.

Store settings show recent delivery status and a **Retry alert** button for failed messages.
“Accepted” means accepted by the provider, not confirmed inbox delivery or reading. After correcting
provider configuration, use the retry button for exhausted messages. Report digest deliveries have
no single store ID and are persisted/retried but do not appear in an individual store's history.

## Access and configuration

The worker needs normal database access. `RESEND_API_KEY` must be set in GitHub Actions secrets;
`ALERTS_FROM` is an optional repository Actions variable and must use a sender verified with Resend.
Slack destinations remain per-store settings. No new package is required.

The database table uses RLS and exposes only status columns to authenticated agency members.
Webhook URLs, recipients and message bodies are worker-only columns. Direct status updates are
denied. The manual retry RPC is deliberately `SECURITY DEFINER` because members cannot write
the outbox directly; it requires a signed-in user, agency membership, a failed delivery, and an
unchanged route. Its search path is empty; anonymous execution is revoked. Supabase's advisor
flags the authenticated execute grant generically; the grant is intentional and isolation is tested.

Migrations `20261030080729_alert_deliveries.sql` and `20261030081717_atomic_incident_alerts.sql`
are applied to the StoreCare HQ Supabase project.
Application/worker code must still be committed and deployed before production uses this queue.
The running old worker continues using its previous sending path until then.

## Verification and remaining boundaries

40 related tests passed against an isolated local PostgreSQL server, including retries, overlapping
routes, concurrent workers, lease recovery, exhaustion, expiry, removed routes, manual retry, and
cross-agency/column access. Worker/web typechecks and the production web build passed. Live
schema checks verified RLS, denied recipient reads/status writes and denied anonymous retry.
No real email or Slack message was sent during verification; provider acceptance/delivery still
needs a separately authorized end-to-end test with the configured destination.

Expiry notifications still pass through the worker after the site check, and report drafting still
gathers digest items in memory before queueing. Those paths can lose a notification if the worker
stops before enqueue; once queued they use the same durable retries. Critical incidents and risky
changes do not have that gap because their database triggers enqueue atomically.

The independent Supabase monitoring-health job still records failures in Cron history. External
operator notification when the worker/scheduler itself stops is separate from these agency alerts;
it must use an independent delivery path so it does not depend on the failed worker.

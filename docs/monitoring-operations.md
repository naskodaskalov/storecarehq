# Monitoring operations

## Requested health checks

New stores atomically create an `initial` row in `public.health_check_requests`. The store page's
**Run health check** action calls `request_health_check(uuid)` as the signed-in user. The RPC
checks membership, monitoring access and paused state; it reuses an active request and enforces
a five-minute per-store cooldown under a store-row lock. Agency members can read status/results,
but cannot change worker status, read lease tokens or request another agency's stores.

Each scan refreshes the product feed even when its normal daily refresh is not due. It runs uptime,
storefront, speed and site checks, followed by checkout only when consent,
devices and a usable product are present. It does not generate reports. A completed phase means
the check ran; it does not mean the store is healthy. Provider errors produce partial/failed scan
status and safe messages while retaining existing metrics. The first snapshot is a baseline.

The GitHub tick processes one requested scan before scheduled work and, if under twelve minutes
elapsed, one more afterwards. Both requested scans and scheduled work hold the same per-store
session advisory lock on a dedicated database connection. The pg-boss worker also drains requests
on its five-minute tick. Requests use `FOR UPDATE SKIP LOCKED`, a unique lease token, fifteen-minute
leases refreshed between phases and at most two worker attempts. Recovery resumes completed phases;
an exhausted interrupted scan ends with a visible failure. Storefront checks and Slack alerts can
still have their existing external-side-effect limitations after a process crash.

The private `storecare_ops.dispatch_health_checks()` reuses the existing Vault-backed GitHub
dispatch function. New requests wake it immediately; a one-minute Cron watchdog retries pending
work and expired leases. A private singleton throttles dispatches to at most one per two minutes.
Requests remain durable on dispatch failure and normal scheduled ticks also drain them. GitHub
queueing/build time and other scans can delay starting; the UI shows queued status, not a promise
of immediate execution. No GitHub token is stored in the browser or Vercel app.

Rollout: apply migration `20261030132924_health_check_requests.sql` (dispatch starts disabled),
push the tested worker/app to main, then enable `storecare_ops.health_check_dispatch_state.enabled`
and deploy the app. The private dispatch-state table deliberately has deny-all RLS and no public
API grants. The authenticated SECURITY DEFINER RPC is intentional and enforces membership and
billing internally; see the [Supabase function-grant advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
No existing stores are backfilled with artificial initial requests.

Verification: thirteen dedicated scan tests plus monitoring/alert/report regression tests passed
against isolated PostgreSQL databases, including automatic insert rollback, agency isolation,
direct-write denial, deduplication/cooldown, consent, partial results, concurrent workers,
store-lock contention, abandoned/stale leases, eligibility changes and dispatch failures. Web
request tests cover authentication, scoped RPC calls and safe errors. Live UI/run verification
is recorded in `task.md` after activation.

## Investigation: 29 October 2026

The configured GitHub schedule is `7,37 * * * *` on main. Scheduled runs were created at
00:50, 06:59 and 14:11 UTC on 29 October, several hours apart. Run
[40888977903](https://github.com/naskodaskalov/storecarehq/actions/runs/40888977903)
finished successfully in 90 seconds. Its worker logs show successful uptime and storefront
checks for both stores, plus successful speed and site checks where due. Database uptime
timestamps match those runs. The long gaps occur before worker execution.

GitHub explicitly documents that scheduled events can be delayed or dropped:
https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule
Changing the cron expression alone does not establish reliable monitoring.

## Changes in this fix

- Missing `DATABASE_URL` now fails visibly instead of returning a successful no-op.
- The runner uses Ubuntu 24.04, avoiding the ongoing `ubuntu-latest` image migration.
- Database connection attempts are bounded to 15 seconds; SQL statements to 60 seconds.
- Failure to read one store's schedule does not prevent remaining stores from running.
- Completed stores are logged immediately, preserving diagnostics if a later operation fails.
- Speed failures produce workflow warnings and retry on the next pass while other checks continue.

## Supabase scheduler active

The approved Supabase scheduler has been installed in project `jiuxvhzsxhidsmuptfka`.
Deployment SQL is saved in `scripts/setup-monitor-scheduler.sql` (operations setup, not an
application migration: ordinary local Postgres/CI does not have Supabase Cron and Vault).
Both jobs were activated on 29 October 2026 after a verified real dispatch:

- `storecare-monitor-dispatch`: `7,37 * * * *` UTC.
- `storecare-monitor-health`: every five minutes; fails in Cron history on missing/rejected
  dispatches or eligible stores without uptime data for 75 minutes.

The health job records failures in Cron history; it does not yet send external notifications.
Functions use the invoking database role, have an empty search path, and are inaccessible to
anonymous and signed-in app users. Dispatch IDs are retained for seven days with no request
headers or tokens in the operations table.

Supabase Cron and `pg_net` POST to
`https://api.github.com/repos/naskodaskalov/storecarehq/actions/workflows/monitor.yml/dispatches`
with JSON `{"ref":"main"}`. Authentication requires a fine-grained GitHub token limited
to this repository with Actions write permission, stored in Supabase Vault. Do not put
tokens in SQL migrations, cron command text, repository files, or application public variables.
Keep the GitHub schedule as a backup; duplicate triggers are serialized by the existing workflow
concurrency group. The updated worker also skips uptime when the last check was under 25 minutes ago.

### Credential handoff

1. Create a fine-grained personal access token in GitHub. Choose resource owner `naskodaskalov`,
   only the `storecarehq` repository, and repository permission **Actions: read and write**.
   GitHub includes Metadata read automatically. Set an expiry and plan rotation before it expires.
   Actions write includes more than dispatching workflows; GitHub does not offer a dispatch-only
   permission. No repository contents write or account permissions are needed.
2. In the StoreCare HQ Supabase project's **Vault**, add the token as a secret named exactly
   `storecare_github_monitor_token`. Use the Vault interface, not a saved SQL query or chat message.
3. Tell the agent the secret is saved. The agent can verify presence without reading the token,
   run `select storecare_ops.dispatch_monitor();`, and inspect the matching response in
   `net._http_response` without exposing headers or credentials. Expect HTTP 200 for API version
   `2026-03-10`; a 2xx response means dispatch accepted, not worker completion.
4. Confirm the corresponding Actions run finishes with real checks and fresh database records.
   Run `select storecare_ops.assert_monitor_health();` successfully, then activate:

```sql
select cron.alter_job(jobid, active := true) from cron.job
where jobname in ('storecare-monitor-dispatch', 'storecare-monitor-health');
```

Use the same statement with `active := false` to pause. Re-running the setup SQL resets both
jobs to inactive deliberately; it never changes the Vault token.

An external dispatch avoids GitHub's scheduled-event delivery queue, but still depends
on runner availability. For strict intervals use the persistent worker instead.

## Acceptance checks after deployment

1. Confirm the fixed workflow is on main; local edits do not update the live workflow.
2. Manually run Monitor stores without force. Confirm the run has real store results,
   rather than only a green status. No eligible stores is valid when all agencies are
   expired or all stores are paused.
3. If using Supabase Cron, inspect both cron history and the HTTP response. An asynchronous
   HTTP submission succeeding does not prove GitHub accepted it. Verify the API's successful
   response and a corresponding Actions run. Treat 401/403 as token/permission errors.
4. Observe at least three consecutive planned intervals and compare per-store `uptime_checks.checked_at`
   against actual workflow start times. Check hourly snapshots and daily jobs separately.
5. Arrange an independent freshness alert before promising monitoring to customers. GitHub
   run-failure emails cannot detect a scheduled run that was never created.

## Verification of source changes

Run `node --test apps/worker/test/run-stores.test.ts apps/worker/test/schedule.test.ts apps/worker/test/db.test.ts`
and `npm run typecheck --workspace @storecare/worker`.
These verify failure isolation, immediate logging, database configuration and scheduling rules.
They do not simulate GitHub's scheduler or validate live database credentials.

Verified on 29 October: 14 worker tests and worker typecheck passed. Live SQL checks passed
for missing-token handling, missing-dispatch handling, and a synthetic HTTP 401 response.
The synthetic rows were rolled back. Job schedules, inactive state, table RLS and function
access restrictions were checked in the live database.

Activation verified on 29 October 2026: Supabase dispatch request 1 returned HTTP 200 and
created [monitoring run 40919369904](https://github.com/naskodaskalov/storecarehq/actions/runs/40919369904).
The run completed successfully in 29 seconds on main commit `8110c1b`. Both eligible stores
wrote uptime records at 17:14:35 UTC and snapshots at 17:14:37 UTC. The health assertion passed;
both Cron jobs were activated and their active state verified. The credential remained in Vault.
Local worker hardening changes still need to be committed and pushed separately; the live
timing fix uses the existing main-branch workflow's dispatch entry point.

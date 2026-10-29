# Monitoring operations

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

## Supabase scheduler installed; activation pending

The approved Supabase scheduler has been installed in project `jiuxvhzsxhidsmuptfka`.
Deployment SQL is saved in `scripts/setup-monitor-scheduler.sql` (operations setup, not an
application migration: ordinary local Postgres/CI does not have Supabase Cron and Vault).
Both jobs remain inactive pending credentials and a verified real dispatch:

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
access restrictions were checked in the live database. A real GitHub dispatch is pending the token.

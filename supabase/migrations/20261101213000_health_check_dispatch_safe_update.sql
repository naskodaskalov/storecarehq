-- Fix: "Could not queue a health check" once health-check dispatch is enabled.
--
-- Supabase loads pg-safeupdate for every API session (ALTER ROLE authenticator SET session_preload_libraries
-- = supautils, safeupdate). It rejects UPDATE and DELETE without a WHERE clause, including statements inside
-- functions called through the API. dispatch_health_checks() updated its singleton state row without one,
-- outside its error handler, so with dispatch enabled every API insert into health_check_requests failed:
-- the store page's "Run health check" and the initial check queued when an agency adds a store.
-- Cron (the one-minute watchdog) does not go through the API, which is why scheduled dispatch kept working.

create or replace function storecare_ops.dispatch_health_checks() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not pg_try_advisory_xact_lock(196307,1) then return; end if;
  if not exists(select 1 from storecare_ops.health_check_dispatch_state where enabled
    and (last_attempt_at is null or last_attempt_at < now()-interval '2 minutes')) then return; end if;
  if not exists(select 1 from public.health_check_requests where
    (status='queued' and next_attempt_at<=now()) or (status='running' and lease_until<now())) then return; end if;
  update storecare_ops.health_check_dispatch_state set last_attempt_at=now() where singleton;
  if to_regprocedure('storecare_ops.dispatch_monitor()') is null then return; end if;
  begin
    execute 'select storecare_ops.dispatch_monitor()';
  exception when others then
    -- No provider response, credential or raw error enters agency-visible scan data.
    null;
  end;
end;
$$;
revoke all on function storecare_ops.dispatch_health_checks() from public,anon,authenticated;

-- Waking the worker is best effort: whatever goes wrong while dispatching, the agency's request is kept
-- (queued) and the watchdog and scheduled ticks pick it up.
create or replace function public.dispatch_requested_health_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform storecare_ops.dispatch_health_checks();
  exception when others then
    null;
  end;
  return new;
end;
$$;
revoke all on function public.dispatch_requested_health_check() from public,anon,authenticated;

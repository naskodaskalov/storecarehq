-- Deployment-only setup for StoreCare HQ; run as postgres, not from the public API.
-- No credentials belong in this file. Jobs start inactive; see docs/monitoring-operations.md.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create schema if not exists storecare_ops;
revoke all on schema storecare_ops from public, anon, authenticated;

create table if not exists storecare_ops.monitor_dispatches (
  request_id bigint primary key,
  requested_at timestamptz not null default now()
);
alter table storecare_ops.monitor_dispatches enable row level security;
revoke all on storecare_ops.monitor_dispatches from public, anon, authenticated;

create or replace function storecare_ops.dispatch_monitor()
returns bigint
language plpgsql security invoker set search_path = ''
as $$
declare
  token text;
  request_id bigint;
begin
  select decrypted_secret into token from vault.decrypted_secrets
    where name = 'storecare_github_monitor_token';
  if token is null or btrim(token) = '' then
    raise exception 'StoreCare monitoring: missing Vault secret storecare_github_monitor_token';
  end if;
  select net.http_post(
    url := 'https://api.github.com/repos/naskodaskalov/storecarehq/actions/workflows/monitor.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || token,
      'Accept', 'application/vnd.github+json',
      'Content-Type', 'application/json',
      'User-Agent', 'StoreCareHQ-Monitor',
      'X-GitHub-Api-Version', '2026-03-10'
    ),
    body := '{"ref":"main"}'::jsonb,
    timeout_milliseconds := 15000
  ) into request_id;
  insert into storecare_ops.monitor_dispatches(request_id) values (request_id);
  delete from storecare_ops.monitor_dispatches where requested_at < now() - interval '7 days';
  return request_id;
end;
$$;
revoke all on function storecare_ops.dispatch_monitor() from public, anon, authenticated;

-- pg_net is asynchronous: a successful submission is not proof of an accepted dispatch.
-- This runs separately, after the response is available. Errors show in Cron history.
create or replace function storecare_ops.assert_monitor_health()
returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  recent storecare_ops.monitor_dispatches%rowtype;
  response net._http_response%rowtype;
  stale_count integer;
begin
  select * into recent from storecare_ops.monitor_dispatches order by requested_at desc limit 1;
  if recent.request_id is null or recent.requested_at < now() - interval '45 minutes' then
    raise exception 'StoreCare monitoring: no dispatch submitted in the last 45 minutes';
  end if;
  select * into response from net._http_response where id = recent.request_id;
  if response.id is null then
    if recent.requested_at < now() - interval '5 minutes' then
      raise exception 'StoreCare monitoring: GitHub dispatch response missing';
    end if;
  elsif response.timed_out or response.error_msg is not null
     or response.status_code is null or response.status_code not between 200 and 299 then
    -- Never include request headers or response bodies in diagnostics.
    raise exception 'StoreCare monitoring: GitHub dispatch failed (HTTP %); check token permissions and expiry', response.status_code;
  end if;

  select count(*) into stale_count from public.stores s
    join public.agencies a on a.id = s.agency_id
    where s.status <> 'paused' and public.agency_has_access(a)
      and s.created_at < now() - interval '75 minutes'
      and not exists (select 1 from public.uptime_checks u
        where u.store_id = s.id and u.checked_at >= now() - interval '75 minutes');
  if stale_count > 0 then
    raise exception 'StoreCare monitoring: % eligible stores have no uptime check in 75 minutes', stale_count;
  end if;
end;
$$;
revoke all on function storecare_ops.assert_monitor_health() from public, anon, authenticated;

select cron.schedule('storecare-monitor-dispatch', '7,37 * * * *',
  'select storecare_ops.dispatch_monitor();');
select cron.schedule('storecare-monitor-health', '*/5 * * * *',
  'select storecare_ops.assert_monitor_health();');
-- Explicit activation follows a successful manual dispatch and health check.
select cron.alter_job(jobid, active := false) from cron.job
  where jobname in ('storecare-monitor-dispatch', 'storecare-monitor-health');
commit;

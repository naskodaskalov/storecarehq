-- Is monitoring actually running? Read by GET /api/health/monitoring (service role only), which an external uptime
-- monitor polls, so a stopped scheduler or worker reaches a person instead of only Cron history.
-- Same rule as storecare_ops.assert_monitor_health(): an eligible store (not paused, agency with access, added more
-- than 75 minutes ago) must have an uptime check in the last 75 minutes. Requested health checks must not wait long.

create or replace function public.monitoring_freshness() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'eligible', count(*),
    'stale', count(*) filter (where not exists (
      select 1 from public.uptime_checks u where u.store_id = s.id and u.checked_at >= now() - interval '75 minutes')),
    'last_check_minutes', (select floor(extract(epoch from now() - max(u.checked_at)) / 60)::int from public.uptime_checks u),
    'waiting_health_checks', (select count(*) from public.health_check_requests r
      where r.status = 'queued' and r.requested_at < now() - interval '30 minutes')
  )
  from public.stores s join public.agencies a on a.id = s.agency_id
  where s.status <> 'paused' and public.agency_has_access(a) and s.created_at < now() - interval '75 minutes';
$$;
revoke all on function public.monitoring_freshness() from public, anon, authenticated;
grant execute on function public.monitoring_freshness() to service_role;

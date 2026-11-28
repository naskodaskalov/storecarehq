-- Client portal: no rollover for stores that were not on the plan for all of last month.
-- Matches the monthly report (packages/reports/src/load.ts), which only rolls hours over when the store
-- existed by the first day of the previous month. minutes_last_month is null otherwise.
create or replace function public.public_store_portal(token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select st.id, st.name, st.public_url, st.status, st.limited_reason, st.health_score, st.timezone, st.created_at,
           a.name as agency_name, a.brand_color, a.logo_url
    from public.stores st
    join public.agencies a on a.id = st.agency_id
    where token is not null
      and token ~ '^[a-f0-9]{64}$'
      and st.portal_token = token
      and public.agency_has_access(a)
  ),
  bounds as (
    select (date_trunc('month', now() at time zone 'UTC'))::date as month_start,
           (date_trunc('month', now() at time zone 'UTC') - interval '1 month')::date as prev_start
  )
  select jsonb_build_object(
    'generated_at', now(),
    'store', jsonb_build_object('name', s.name, 'public_url', s.public_url, 'status', s.status,
      'limited_reason', s.limited_reason, 'health_score', s.health_score, 'timezone', s.timezone),
    'agency', jsonb_build_object('name', s.agency_name, 'brand_color', s.brand_color, 'logo_url', s.logo_url),
    'plan', (select jsonb_build_object('name', cp.name, 'hours_included', cp.hours_included, 'rollover_rule', cp.rollover_rule)
             from public.care_plans cp where cp.store_id = s.id),
    'month_start', b.month_start,
    'minutes_this_month', (select coalesce(sum(w.minutes), 0) from public.work_entries w
                           where w.store_id = s.id and w.counts_to_plan and w.work_date >= b.month_start),
    'minutes_last_month', case when s.created_at < (b.prev_start + 1)::timestamp at time zone 'UTC' then
                            (select coalesce(sum(w.minutes), 0) from public.work_entries w
                             where w.store_id = s.id and w.counts_to_plan and w.work_date >= b.prev_start and w.work_date < b.month_start)
                          end,
    'work', coalesce((
      select jsonb_agg(jsonb_build_object('work_date', w.work_date, 'minutes', w.minutes,
               'text', coalesce(nullif(btrim(w.client_text), ''), w.title)) order by w.work_date desc, w.created_at desc)
      from (select * from public.work_entries w
            where w.store_id = s.id and w.work_date >= (now() - interval '45 days')::date
              and (w.counts_to_plan or nullif(btrim(w.client_text), '') is not null)
            order by w.work_date desc, w.created_at desc limit 30) w), '[]'::jsonb),
    'uptime_days', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'checks', d.checks, 'ok', d.ok) order by d.day)
      from (select (u.checked_at at time zone 'UTC')::date as day, count(*) as checks, count(*) filter (where u.ok) as ok
            from public.uptime_checks u
            where u.store_id = s.id and u.checked_at >= now() - interval '30 days'
            group by 1) d), '[]'::jsonb),
    'last_check', (select jsonb_build_object('checked_at', u.checked_at, 'ok', u.ok, 'ms', u.ms)
                   from public.uptime_checks u where u.store_id = s.id order by u.checked_at desc limit 1),
    'incidents', coalesce((
      select jsonb_agg(jsonb_build_object('kind', i.kind, 'opened_at', i.opened_at, 'resolved_at', i.resolved_at,
               'client_note', i.client_note) order by i.opened_at desc)
      from (select * from public.incidents i
            where i.store_id = s.id and (i.resolved_at is null or i.opened_at >= now() - interval '30 days')
            order by i.opened_at desc limit 10) i), '[]'::jsonb),
    'checkout', coalesce((
      select jsonb_agg(jsonb_build_object('device', c.device, 'result', c.result, 'ran_at', c.ran_at))
      from (select distinct on (c.device) c.device, c.result, c.ran_at from public.checkout_runs c
            where c.store_id = s.id and c.ran_at >= now() - interval '3 days'
            order by c.device, c.ran_at desc) c), '[]'::jsonb),
    'checkout_30d', (select jsonb_build_object('runs', count(*), 'passed', count(*) filter (where c.result = 'pass'))
                     from public.checkout_runs c where c.store_id = s.id and c.ran_at >= now() - interval '30 days' and c.result <> 'blocked'),
    'speed', (select jsonb_build_object('sampled_at', x.sampled_at, 'performance_score', x.performance_score, 'lcp_ms', x.lcp_ms)
              from public.speed_samples x where x.store_id = s.id and x.page = 'home' and x.strategy = 'mobile'
              order by x.sampled_at desc limit 1),
    'speed_before', (select jsonb_build_object('sampled_at', x.sampled_at, 'performance_score', x.performance_score, 'lcp_ms', x.lcp_ms)
              from public.speed_samples x where x.store_id = s.id and x.page = 'home' and x.strategy = 'mobile'
                and x.sampled_at <= now() - interval '28 days'
              order by x.sampled_at desc limit 1),
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object('period', r.period, 'share_token', r.share_token) order by r.period desc)
      from (select r.period, r.share_token from public.reports r
            where r.store_id = s.id and r.status in ('approved', 'sent') order by r.period desc limit 12) r), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object('subject', q.subject, 'status', q.status, 'urgency', q.urgency,
               'received_at', q.received_at, 'updated_at', q.updated_at) order by q.received_at desc)
      from (select * from public.requests q
            where q.store_id = s.id and (q.status <> 'done' or q.received_at >= now() - interval '60 days')
            order by q.received_at desc limit 20) q), '[]'::jsonb)
  )
  from s cross join bounds b;
$$;

revoke all on function public.public_store_portal(text) from public;
grant execute on function public.public_store_portal(text) to anon, authenticated;

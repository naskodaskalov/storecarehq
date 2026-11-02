-- Numbers for the admin overview (/admin), in one call. Service role only: the page checks the signed-in admin first.
-- p_tz is the admin's time zone: "today" starts at local midnight and "week" is the last 7 calendar days, today included.
-- People are auth users that are neither deleted nor anonymous. Funnel steps count people; a person passes a
-- workspace step when any workspace they belong to does. Stores and workspaces are counted as they exist now.
create or replace function public.admin_metrics(p_tz text default 'UTC') returns jsonb
language sql stable security definer set search_path = '' as $$
  with bounds as (
    select date_trunc('day', now() at time zone p_tz) at time zone p_tz as today,
           (date_trunc('day', now() at time zone p_tz) - interval '6 days') at time zone p_tz as week
  ),
  people as (
    select u.id, u.email, u.created_at, u.email_confirmed_at, u.last_sign_in_at
    from auth.users u
    where u.deleted_at is null and not coalesce(u.is_anonymous, false)
  ),
  progress as (
    select m.user_id,
           bool_or(exists (select 1 from public.stores s where s.agency_id = a.id)) as has_store,
           bool_or(a.stripe_subscription_id is not null) as started_trial,
           bool_or(a.subscription_status = 'active') as paying
    from public.memberships m join public.agencies a on a.id = m.agency_id
    group by m.user_id
  )
  select jsonb_build_object(
    'timezone', p_tz,
    'generated_at', now(),
    'users', (select jsonb_build_object(
        'today', count(*) filter (where p.created_at >= b.today),
        'week', count(*) filter (where p.created_at >= b.week),
        'total', count(*),
        'unconfirmed', count(*) filter (where p.email_confirmed_at is null))
      from people p cross join bounds b),
    'stores', (select jsonb_build_object(
        'today', count(*) filter (where s.created_at >= b.today),
        'week', count(*) filter (where s.created_at >= b.week),
        'total', count(*),
        'active', count(*) filter (where s.status = 'active'),
        'limited', count(*) filter (where s.status = 'limited'),
        'paused', count(*) filter (where s.status = 'paused'))
      from public.stores s cross join bounds b),
    'workspaces', (select jsonb_build_object(
        'today', count(*) filter (where a.created_at >= b.today),
        'week', count(*) filter (where a.created_at >= b.week),
        'total', count(*))
      from public.agencies a cross join bounds b),
    'outreach', (select jsonb_build_object(
        'today', count(*) filter (where o.sent_at >= b.today),
        'week', count(*) filter (where o.sent_at >= b.week),
        'total', count(*),
        'agencies', count(distinct o.agency_domain))
      from public.outreach_contacts o cross join bounds b),
    'subscriptions', (select jsonb_build_object(
        'trialing', count(*) filter (where a.subscription_status = 'trialing'),
        'active', count(*) filter (where a.subscription_status = 'active'),
        'past_due', count(*) filter (where a.subscription_status = 'past_due'),
        'cancelling', count(*) filter (where a.cancel_at_period_end and a.subscription_status in ('trialing', 'active', 'past_due')),
        'ended', count(*) filter (where a.stripe_subscription_id is not null
          and coalesce(a.subscription_status, '') not in ('trialing', 'active', 'past_due')),
        'no_card', count(*) filter (where a.stripe_subscription_id is null),
        'plans', coalesce((select jsonb_agg(jsonb_build_object('status', x.subscription_status, 'plan', x.plan,
            'cancelling', x.cancelling, 'count', x.n) order by x.subscription_status, x.plan, x.cancelling)
          from (select a2.subscription_status, a2.plan, a2.cancel_at_period_end as cancelling, count(*) as n
                from public.agencies a2 where a2.subscription_status in ('trialing', 'active', 'past_due')
                group by 1, 2, 3) x), '[]'::jsonb))
      from public.agencies a),
    'funnel', (select jsonb_build_object(
        'signed_up', count(*),
        'confirmed', count(*) filter (where p.email_confirmed_at is not null),
        'workspace', count(g.user_id),
        'store', count(*) filter (where g.has_store),
        'trial', count(*) filter (where g.started_trial),
        'paying', count(*) filter (where g.paying))
      from people p left join progress g on g.user_id = p.id),
    'recent_signups', coalesce((select jsonb_agg(r order by r.created_at desc) from (
        select p.email, p.created_at, p.email_confirmed_at is not null as confirmed, p.last_sign_in_at,
               w.name as workspace, w.plan, w.subscription_status, w.cancel_at_period_end,
               case when w.subscription_status = 'trialing' then w.current_period_end end as trial_ends_at,
               (select count(*) from public.stores s where s.agency_id = w.id) as stores
        from people p
        left join lateral (
          select ag.id, ag.name, ag.plan, ag.subscription_status, ag.cancel_at_period_end, ag.current_period_end
          from public.memberships m join public.agencies ag on ag.id = m.agency_id
          where m.user_id = p.id
          order by m.role = 'owner' desc, m.created_at
          limit 1) w on true
        order by p.created_at desc
        limit 10) r), '[]'::jsonb),
    'activity', (select jsonb_build_object(
        'reports_sent_week', (select count(*) from public.reports r where r.sent_at >= b.week),
        'work_entries_week', (select count(*) from public.work_entries e where e.created_at >= b.week),
        'open_incidents', (select count(*) from public.incidents i where i.resolved_at is null))
      from bounds b),
    'monitoring', public.monitoring_freshness()
  );
$$;
revoke all on function public.admin_metrics(text) from public, anon, authenticated;
grant execute on function public.admin_metrics(text) to service_role;

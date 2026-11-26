-- Client portal: an always-on, agency-branded page per client store (/p/<token>), and a request inbox.
--
-- The agency turns the portal on in store settings, which stores a 64-character token on the store.
-- The client opens the link without an account. public_store_portal() returns only what the client
-- already sees in monthly reports (status, uptime, speed, care-plan hours, client-facing work, approved
-- reports) plus the store's recent requests. Internal detail (incident causes, raw work titles marked
-- not to count and without client text, contact emails) never leaves the database.
--
-- From the portal the client sends requests with submit_portal_request(). Each one lands in the existing
-- public.requests table and queues an alert to the agency's email and Slack routes through the outbox.

alter table public.stores
  add column if not exists portal_token text,
  add column if not exists portal_enabled_at timestamptz;

alter table public.stores
  add constraint stores_portal_token_format check (portal_token is null or portal_token ~ '^[a-f0-9]{64}$');
create unique index if not exists stores_portal_token on public.stores (portal_token) where portal_token is not null;

alter table public.requests
  add column if not exists from_name text,
  add column if not exists source text not null default 'app',
  add column if not exists urgency text not null default 'normal',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists work_entry_id uuid references public.work_entries (id) on delete set null;

alter table public.requests
  add constraint requests_source check (source in ('app', 'portal', 'email')),
  add constraint requests_urgency check (urgency in ('normal', 'urgent')),
  add constraint requests_subject_length check (char_length(subject) between 1 and 200),
  add constraint requests_body_length check (body is null or char_length(body) <= 5000),
  add constraint requests_from_length check (
    (from_email is null or char_length(from_email) <= 320) and (from_name is null or char_length(from_name) <= 120)
  );

create index if not exists requests_store on public.requests (store_id, received_at desc);
create index if not exists requests_agency_open on public.requests (agency_id, received_at desc) where status <> 'done';

-- The client's page. Null unless the token matches an enabled portal of an agency with an active plan.
create or replace function public.public_store_portal(token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with s as (
    select st.id, st.name, st.public_url, st.status, st.limited_reason, st.health_score, st.timezone,
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
    'minutes_last_month', (select coalesce(sum(w.minutes), 0) from public.work_entries w
                           where w.store_id = s.id and w.counts_to_plan and w.work_date >= b.prev_start and w.work_date < b.month_start),
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

-- A request from the portal. Returns the new request's id. Errors are short codes the page translates.
create or replace function public.submit_portal_request(
  token text, p_name text, p_email text, p_subject text, p_body text, p_urgency text default 'normal'
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_store public.stores%rowtype;
  v_id uuid;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_subject text := nullif(btrim(coalesce(p_subject, '')), '');
  v_body text := nullif(btrim(coalesce(p_body, '')), '');
  v_urgency text := coalesce(nullif(p_urgency, ''), 'normal');
  v_title text;
begin
  if token is null or token !~ '^[a-f0-9]{64}$' then raise exception 'portal_not_found'; end if;
  select st.* into v_store from public.stores st join public.agencies a on a.id = st.agency_id
    where st.portal_token = token and public.agency_has_access(a);
  if v_store.id is null then raise exception 'portal_not_found'; end if;

  if v_subject is null then raise exception 'subject_required'; end if;
  if char_length(v_subject) > 200 or char_length(coalesce(v_body, '')) > 5000
     or char_length(coalesce(v_name, '')) > 120 or char_length(coalesce(v_email, '')) > 320 then
    raise exception 'too_long';
  end if;
  if v_email is null or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then raise exception 'email_invalid'; end if;
  if v_urgency not in ('normal', 'urgent') then raise exception 'urgency_invalid'; end if;

  -- A shared link must not become a way to flood the agency's inbox.
  perform pg_advisory_xact_lock(hashtextextended('portal_request/' || v_store.id::text, 0));
  if (select count(*) from public.requests q where q.store_id = v_store.id and q.source = 'portal'
        and q.received_at >= now() - interval '1 hour') >= 10
     or (select count(*) from public.requests q where q.store_id = v_store.id and q.source = 'portal'
        and q.received_at >= now() - interval '1 day') >= 40 then
    raise exception 'rate_limited';
  end if;

  insert into public.requests (store_id, agency_id, from_name, from_email, subject, body, source, urgency)
    values (v_store.id, v_store.agency_id, v_name, v_email, v_subject, v_body, 'portal', v_urgency)
    returning id into v_id;

  v_title := case when v_urgency = 'urgent' then 'Urgent client request: ' else 'New client request: ' end || v_subject;
  insert into public.alert_deliveries (agency_id, store_id, route_id, event_key, channel, target, subject, body)
    select v_store.agency_id, v_store.id, r.id, 'request/' || v_id, r.channel, r.target,
      left('[' || v_store.name || '] ' || v_title, 300),
      v_store.name || ': ' || v_title || E'\nFrom ' || coalesce(v_name || ' <' || v_email || '>', v_email)
        || coalesce(E'\n\n' || left(v_body, 1500), '')
        || E'\n\nhttps://app.storecarehq.com/requests'
    from public.alert_routes r
    where r.agency_id = v_store.agency_id
      and (r.store_id is null or r.store_id = v_store.id)
      and r.channel in ('email', 'slack')
    on conflict (agency_id, event_key, channel, target) do nothing;

  return v_id;
end;
$$;

revoke all on function public.submit_portal_request(text, text, text, text, text, text) from public;
grant execute on function public.submit_portal_request(text, text, text, text, text, text) to anon, authenticated;

-- Keep updated_at honest when the agency moves a request along.
create or replace function public.touch_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function public.touch_request() from public, anon, authenticated;
create trigger requests_touch before update on public.requests for each row execute function public.touch_request();

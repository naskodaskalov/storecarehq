create table public.health_check_requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  source text not null check (source in ('initial','manual')),
  status text not null default 'queued' check (status in ('queued','running','completed','partial','failed')),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  phase text,
  results jsonb not null default '{}',
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now()
);
create unique index health_check_one_active on public.health_check_requests(store_id) where status in ('queued','running');
create index health_check_store_history on public.health_check_requests(store_id,requested_at desc);
create index health_check_pending on public.health_check_requests(next_attempt_at) where status in ('queued','running');
alter table public.health_check_requests enable row level security;
revoke all on public.health_check_requests from public,anon,authenticated;
grant select(id,store_id,agency_id,source,status,requested_at,started_at,finished_at,phase,results) on public.health_check_requests to authenticated;
create policy "agency members read scans" on public.health_check_requests for select to authenticated using (public.is_member(agency_id));

create schema if not exists storecare_ops;
revoke all on schema storecare_ops from public,anon,authenticated;
create table storecare_ops.health_check_dispatch_state (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  last_attempt_at timestamptz
);
insert into storecare_ops.health_check_dispatch_state(singleton) values(true);
alter table storecare_ops.health_check_dispatch_state enable row level security;
revoke all on storecare_ops.health_check_dispatch_state from public,anon,authenticated;

-- Private, fixed-destination dispatch. Credential access stays in the existing operations function.
-- Disabled until the new worker has been pushed to main. Failures never roll back a scan request.
create function storecare_ops.dispatch_health_checks() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not pg_try_advisory_xact_lock(196307,1) then return; end if;
  if not exists(select 1 from storecare_ops.health_check_dispatch_state where enabled
    and (last_attempt_at is null or last_attempt_at < now()-interval '2 minutes')) then return; end if;
  if not exists(select 1 from public.health_check_requests where
    (status='queued' and next_attempt_at<=now()) or (status='running' and lease_until<now())) then return; end if;
  update storecare_ops.health_check_dispatch_state set last_attempt_at=now();
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

create function public.dispatch_requested_health_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform storecare_ops.dispatch_health_checks();
  return new;
end;
$$;
revoke all on function public.dispatch_requested_health_check() from public,anon,authenticated;
create trigger dispatch_health_check after insert on public.health_check_requests
for each row execute function public.dispatch_requested_health_check();

create function public.request_health_check(p_store uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  s public.stores%rowtype;
  active_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to request a health check.'; end if;
  select * into s from public.stores where id=p_store and public.is_member(agency_id) for update;
  if not found then raise exception 'Store unavailable.'; end if;
  if s.status='paused' then raise exception 'Resume monitoring before running a health check.'; end if;
  if not exists(select 1 from public.agencies a where a.id=s.agency_id and public.agency_has_access(a)) then
    raise exception 'Choose an active plan before running a health check.';
  end if;
  select id into active_id from public.health_check_requests where store_id=s.id and status in ('queued','running');
  if active_id is not null then return active_id; end if;
  if exists(select 1 from public.health_check_requests where store_id=s.id and requested_at>now()-interval '5 minutes') then
    raise exception 'Please wait five minutes between health checks.';
  end if;
  insert into public.health_check_requests(store_id,agency_id,source) values(s.id,s.agency_id,'manual') returning id into active_id;
  return active_id;
end;
$$;
revoke all on function public.request_health_check(uuid) from public,anon,authenticated;
grant execute on function public.request_health_check(uuid) to authenticated;

create function public.queue_initial_health_check() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status<>'paused' and exists(select 1 from public.agencies a where a.id=new.agency_id and public.agency_has_access(a)) then
    insert into public.health_check_requests(store_id,agency_id,source) values(new.id,new.agency_id,'initial');
  end if;
  return new;
end;
$$;
revoke all on function public.queue_initial_health_check() from public,anon,authenticated;
create trigger initial_health_check after insert on public.stores for each row execute function public.queue_initial_health_check();

-- The watchdog retries dispatches and wakes workers for abandoned leases, never every store.
do $$ begin
  if to_regnamespace('cron') is not null then
    execute $sql$select cron.schedule('storecare-health-check-dispatch','* * * * *',
      'select storecare_ops.dispatch_health_checks();')$sql$;
  end if;
end $$;

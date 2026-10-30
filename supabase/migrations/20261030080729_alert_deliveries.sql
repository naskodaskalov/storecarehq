create table public.alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  store_id uuid references public.stores(id) on delete cascade,
  route_id uuid references public.alert_routes(id) on delete set null,
  event_key text not null,
  channel text not null check (channel in ('email', 'slack')),
  target text not null,
  subject text not null,
  body text not null,
  status text not null default 'pending' check (status in ('pending','sending','retry','sent','failed','cancelled')),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  lease_token uuid,
  unique (agency_id, event_key, channel, target)
);
create index alert_deliveries_due on public.alert_deliveries(next_attempt_at) where status in ('pending','retry','sending');
create index alert_deliveries_store on public.alert_deliveries(store_id, created_at desc);
create index alert_deliveries_route on public.alert_deliveries(route_id);
create index alert_deliveries_agency on public.alert_deliveries(agency_id);
alter table public.alert_deliveries enable row level security;
create policy "members read alert delivery status" on public.alert_deliveries
  for select to authenticated using (public.is_member(agency_id));
-- Recipients, webhook credentials and message bodies are worker-only.
revoke all on public.alert_deliveries from public, anon, authenticated;
grant select (id, agency_id, store_id, channel, subject, status, attempts, created_at, next_attempt_at, sent_at, last_error)
  on public.alert_deliveries to authenticated;
grant all on public.alert_deliveries to service_role;

-- Explicitly requested retries create a new delivery and key. Lock the original to prevent double clicks.
create or replace function public.retry_alert_delivery(delivery_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare d public.alert_deliveries%rowtype;
begin
  select * into d from public.alert_deliveries where id=delivery_id for update;
  if d.id is null or auth.uid() is null or not public.is_member(d.agency_id) then
    raise exception 'Alert delivery not found';
  end if;
  if d.status <> 'failed' then raise exception 'Only failed alerts can be retried'; end if;
  if not exists(select 1 from public.alert_routes r where r.id=d.route_id
    and r.agency_id=d.agency_id and r.channel=d.channel and r.target=d.target) then
    raise exception 'This alert route was removed or changed';
  end if;
  insert into public.alert_deliveries(agency_id,store_id,route_id,event_key,channel,target,subject,body)
    values(d.agency_id,d.store_id,d.route_id,d.event_key||'/retry/'||gen_random_uuid(),d.channel,d.target,d.subject,d.body);
  update public.alert_deliveries set status='cancelled',last_error='Queued again at your request.' where id=d.id;
end;
$$;
revoke all on function public.retry_alert_delivery(uuid) from public, anon;
grant execute on function public.retry_alert_delivery(uuid) to authenticated;

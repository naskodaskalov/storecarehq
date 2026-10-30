-- Use the canonical production domain in newly queued monitoring alerts.
-- Only the updated worker opts into this path, allowing the migration to precede deployment.
create or replace function public.queue_monitor_event()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  v_title text;
  v_body text;
  v_key text;
  v_severity text;
  v_name text;
begin
  if tg_table_name='changes' then
    if not new.risky then return new; end if;
    v_key := 'change/'||new.id;
    v_title := new.summary;
    v_body := 'Detected on the live storefront.';
    v_severity := 'risky';
  else
    v_severity := 'incident';
    if tg_op='INSERT' then
      v_key := 'incident/'||new.id||'/open';
      v_title := case when new.kind='down' then 'Store is down' else 'Checkout test failed' end;
      v_body := coalesce(new.cause,'A monitoring check failed.');
    elsif old.resolved_at is null and new.resolved_at is not null then
      v_key := 'incident/'||new.id||'/resolved';
      v_title := case when new.kind='down' then 'Store is back up' else 'Checkout is working again' end;
      v_body := 'The latest check passed.';
    else return new;
    end if;
  end if;
  select s.name into v_name from public.stores s where s.id=new.store_id and s.agency_id=new.agency_id;
  if v_name is null then raise exception 'Monitoring event agency does not match its store'; end if;
  insert into public.alert_deliveries(agency_id,store_id,route_id,event_key,channel,target,subject,body)
    select new.agency_id,new.store_id,r.id,v_key,r.channel,r.target,
      '['||v_name||'] '||v_title,
      v_name||': '||v_title||E'\n'||v_body||E'\nhttps://www.storecarehq.com/stores/'||new.store_id
    from public.alert_routes r where r.agency_id=new.agency_id
      and (r.store_id is null or r.store_id=new.store_id) and r.channel in ('email','slack')
      and (v_severity='incident' or r.min_severity in ('info','risky'))
    on conflict (agency_id,event_key,channel,target) do nothing;
  return new;
end;
$$;
revoke all on function public.queue_monitor_event() from public, anon, authenticated;

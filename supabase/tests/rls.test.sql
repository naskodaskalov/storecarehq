-- Run after the stub and the migrations. Raises an exception on the first failed check.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@northline.studio'),
  ('00000000-0000-0000-0000-00000000000b', 'b@other.agency');

set role authenticated;

-- User A creates an agency and a store.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.create_agency('Northline Studio', '6–15') as agency_a \gset
insert into public.stores (agency_id, name, public_url) values (:'agency_a', 'Juniper & Ash', 'https://juniperandash.com');

-- User B creates their own agency.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select public.create_agency('Other Agency') as agency_b \gset

do $$ begin
  if (select count(*) from public.stores) <> 0 then raise exception 'B can see A''s stores'; end if;
  if (select count(*) from public.agencies) <> 1 then raise exception 'B sees % agencies', (select count(*) from public.agencies); end if;
end $$;

-- B cannot insert into A's agency, but can into their own.
select set_config('test.agency_a', :'agency_a', false);
do $$ begin
  begin
    insert into public.stores (agency_id, name, public_url)
      values (current_setting('test.agency_a')::uuid, 'Sneaky', 'https://x.com');
    raise exception 'B was able to add a store to A''s agency';
  exception when insufficient_privilege then null;
  end;
end $$;
insert into public.stores (agency_id, name, public_url) values (:'agency_b', 'Own', 'https://own.com');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  if (select count(*) from public.stores) <> 1 then raise exception 'A should see exactly 1 store'; end if;
end $$;

-- Members cannot write monitoring rows (worker only).
do $$ begin
  begin
    insert into public.uptime_checks (store_id, agency_id, ok)
      select id, agency_id, true from public.stores limit 1;
    raise exception 'member was able to write uptime_checks';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Changing a store's address clears its snapshots (written by the worker) via the trigger.
reset role;
insert into public.storefront_snapshots (store_id, agency_id, feed_status)
  select id, agency_id, 'ok' from public.stores where public_url = 'https://juniperandash.com';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update public.stores set public_url = 'https://new-juniper.com' where public_url = 'https://juniperandash.com';
reset role;
do $$ begin
  if (select count(*) from public.storefront_snapshots) <> 0 then raise exception 'url change should clear snapshots'; end if;
end $$;

-- A member can delete their own store; its monitoring rows go with it.
insert into public.uptime_checks (store_id, agency_id, ok)
  select id, agency_id, true from public.stores where public_url = 'https://new-juniper.com';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
delete from public.stores where public_url = 'https://new-juniper.com';
reset role;
do $$ begin
  if (select count(*) from public.stores where public_url = 'https://new-juniper.com') <> 0 then raise exception 'store not deleted'; end if;
  if (select count(*) from public.uptime_checks) <> 0 then raise exception 'monitoring rows not deleted with store'; end if;
end $$;

select 'rls ok' as result;

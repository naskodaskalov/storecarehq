-- Run after the stub and the migrations. Raises an exception on the first failed check.
\set ON_ERROR_STOP on

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@northline.studio'),
  ('00000000-0000-0000-0000-00000000000b', 'b@other.agency');

set role authenticated;

-- User A creates an agency and a store.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.create_agency('Northline Studio', '6–15') as agency_a \gset
-- (Stripe would set this after checkout; new agencies cannot add stores before.)
reset role;
update public.agencies set plan = 'agency', subscription_status = 'trialing' where id = :'agency_a';
set role authenticated;
insert into public.stores (agency_id, name, public_url) values (:'agency_a', 'Juniper & Ash', 'https://juniperandash.com');

-- User B creates their own agency.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select public.create_agency('Other Agency') as agency_b \gset
-- B's first store is added further down, after checking a new agency has no access.

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
reset role;
update public.agencies set trial_ends_at = now() + interval '7 days' where id = :'agency_b'; -- older card-free trial
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
insert into public.stores (agency_id, name, public_url) values (:'agency_b', 'Own', 'https://own.com');
reset role;
update public.agencies set trial_ends_at = null where id = :'agency_b';
set role authenticated;

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

-- Reports: anonymous users read a report only through public_report, only once approved.
reset role;
with s as (
  insert into public.stores (agency_id, name, public_url)
  select id, 'Report Store', 'https://report-store.com' from public.agencies where name = 'Northline Studio'
  returning id, agency_id
)
insert into public.reports (store_id, agency_id, period, summary_text)
  select id, agency_id, '2026-10-01', 'All good.' from s;
select share_token as token from public.reports where summary_text = 'All good.' \gset

set role anon;
do $$ begin
  begin
    perform 1 from public.reports;
    raise exception 'anon could read the reports table';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('test.token', :'token', false);
do $$ begin
  if public.public_report(current_setting('test.token')) is not null then raise exception 'draft report was public'; end if;
  if public.public_report('short') is not null then raise exception 'short token accepted'; end if;
end $$;

reset role;
update public.reports set status = 'approved' where share_token = :'token';
set role anon;
do $$
declare r jsonb;
begin
  r := public.public_report(current_setting('test.token'));
  if r is null then raise exception 'approved report not readable by token'; end if;
  if r->>'store_name' <> 'Report Store' or r->>'agency_name' <> 'Northline Studio' then raise exception 'wrong report: %', r; end if;
  if public.public_report(current_setting('test.token') || 'x') is not null then raise exception 'wrong token accepted'; end if;
end $$;
reset role;

-- Billing: members cannot change their plan, trial or Stripe fields; they can rename the agency.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update public.agencies set name = 'Northline Studio';
do $$ begin
  begin
    update public.agencies set plan = 'pro';
    raise exception 'member could change their plan';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.agencies set trial_ends_at = now() + interval '1 year';
    raise exception 'member could extend their trial';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.agencies set subscription_status = 'active';
    raise exception 'member could mark themselves as paying';
  exception when insufficient_privilege then null;
  end;
end $$;

-- New agencies have no access until they start a plan (card-first trial in Stripe).
reset role;
do $$ begin
  if (select public.agency_has_access(a) from public.agencies a where name = 'Other Agency') then raise exception 'new agency should need a plan'; end if;
end $$;
-- Stripe's trial counts as subscribed.
update public.agencies set plan = 'solo', subscription_status = 'trialing' where name = 'Other Agency';
do $$ begin
  if not (select public.agency_has_access(a) from public.agencies a where name = 'Other Agency') then raise exception 'trialing should have access'; end if;
end $$;

-- Store limits: trial 20, Solo 5; none after the trial ends without a plan.
update public.agencies set plan = 'solo', subscription_status = 'active' where name = 'Other Agency';
insert into public.stores (agency_id, name, public_url)
  select id, 'S' || n, 'https://s' || n || '.com' from public.agencies, generate_series(1, 4) n where name = 'Other Agency';
do $$ begin
  begin
    insert into public.stores (agency_id, name, public_url) select id, 'Sixth', 'https://six.com' from public.agencies where name = 'Other Agency';
    raise exception 'Solo allowed a 6th store';
  exception when raise_exception then
    if sqlerrm not like 'Solo plan includes up to 5 stores%' then raise; end if;
  end;
end $$;
update public.agencies set plan = 'agency' where name = 'Other Agency';
insert into public.stores (agency_id, name, public_url) select id, 'Sixth', 'https://six.com' from public.agencies where name = 'Other Agency';
update public.agencies set plan = 'trial', subscription_status = 'canceled', trial_ends_at = now() - interval '1 day' where name = 'Other Agency';
do $$ begin
  if (select public.agency_has_access(a) from public.agencies a where name = 'Other Agency') then raise exception 'expired trial still has access'; end if;
  begin
    insert into public.stores (agency_id, name, public_url) select id, 'Late', 'https://late.com' from public.agencies where name = 'Other Agency';
    raise exception 'expired trial could add a store';
  exception when raise_exception then
    if sqlerrm not like 'Choose a plan to add stores%' then raise; end if;
  end;
end $$;

-- BFCM audits: members read and add audits for their own unpaused stores while the plan is active; afterwards only
-- the note, client link and sent fields change. The client link shows an audit only after it is shared.
reset role;
insert into public.stores (agency_id, name, public_url) values (:'agency_a', 'Juniper & Ash', 'https://juniperandash.com') returning id as store_a \gset
select id as store_b from public.stores where name = 'Own' \gset
select set_config('test.store_a', :'store_a', false), set_config('test.store_b', :'store_b', false), set_config('test.agency_a', :'agency_a', false);
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into public.store_audits (store_id, agency_id, audit, verdict, fixes, looks)
  values (:'store_a', :'agency_a', '{"version":1,"storeName":"Juniper & Ash"}', 'fix', 1, 2)
  returning id as audit_a, share_token as token_a \gset
select set_config('test.audit_a', :'audit_a', false), set_config('test.token_a', :'token_a', false);
do $$ begin
  if (select created_by from public.store_audits where id = current_setting('test.audit_a')::uuid) <> '00000000-0000-0000-0000-00000000000a' then raise exception 'audit should record who ran it'; end if;
  if length(current_setting('test.token_a')) <> 64 then raise exception 'share token should be 64 characters'; end if;
  begin
    insert into public.store_audits (store_id, agency_id, audit, verdict) values (current_setting('test.store_b')::uuid, current_setting('test.agency_a')::uuid, '{}', 'ready');
    raise exception 'A audited another agency''s store under its own agency';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.store_audits (store_id, agency_id, audit, verdict, created_by) values (current_setting('test.store_a')::uuid, current_setting('test.agency_a')::uuid, '{}', 'ready', '00000000-0000-0000-0000-00000000000b');
    raise exception 'A recorded an audit as someone else';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.store_audits set verdict = 'ready', fixes = 0 where id = current_setting('test.audit_a')::uuid;
    raise exception 'A rewrote an audit''s result';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.store_audits where id = current_setting('test.audit_a')::uuid;
    raise exception 'A deleted an audit';
  exception when insufficient_privilege then null;
  end;
end $$;
update public.store_audits set note = 'We freeze theme changes from 24 Nov.' where id = :'audit_a';

-- Not shared yet: the client link shows nothing; then it does, with the agency's branding; then not again.
reset role;
set role anon;
do $$ begin
  if public.public_audit(current_setting('test.token_a')) is not null then raise exception 'unshared audit visible through its link'; end if;
  begin
    perform 1 from public.store_audits;
    raise exception 'anonymous visitors can read audits';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update public.store_audits set shared_at = now() where id = :'audit_a';
reset role;
set role anon;
do $$ declare r jsonb; begin
  r := public.public_audit(current_setting('test.token_a'));
  if r is null or r->>'agency_name' <> 'Northline Studio' or r->>'note' <> 'We freeze theme changes from 24 Nov.' or r->'audit'->>'storeName' <> 'Juniper & Ash' then raise exception 'shared audit link returned %', r; end if;
  if public.public_audit(left(current_setting('test.token_a'), 31)) is not null or public.public_audit('') is not null then raise exception 'short tokens must not match'; end if;
end $$;

-- Other agencies see nothing and change nothing; expired plans and paused stores can't be audited.
reset role;
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
update public.store_audits set shared_at = null where id = :'audit_a';
do $$ begin
  if exists (select 1 from public.store_audits) then raise exception 'B can see A''s audits'; end if;
  begin
    insert into public.store_audits (store_id, agency_id, audit, verdict) values (current_setting('test.store_b')::uuid, (select agency_id from public.stores where id = current_setting('test.store_b')::uuid), '{}', 'ready');
    raise exception 'an agency without an active plan added an audit';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
do $$ begin
  if (select shared_at from public.store_audits where id = current_setting('test.audit_a')::uuid) is null then raise exception 'B turned off A''s client link'; end if;
end $$;
update public.stores set status = 'paused' where id = :'store_a';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  begin
    insert into public.store_audits (store_id, agency_id, audit, verdict) values (current_setting('test.store_a')::uuid, current_setting('test.agency_a')::uuid, '{}', 'ready');
    raise exception 'a paused store was audited';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
update public.stores set status = 'active' where id = :'store_a';

select 'rls ok' as result;

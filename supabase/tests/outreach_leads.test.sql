-- Run against an isolated test database after the outreach-leads migration.
begin;
do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.outreach_leads'::regclass) then raise exception 'RLS must be enabled'; end if;
  if has_table_privilege('anon', 'public.outreach_leads', 'SELECT') or has_table_privilege('authenticated', 'public.outreach_leads', 'SELECT') then raise exception 'Browser roles must not read leads'; end if;
  if has_table_privilege('service_role', 'public.outreach_leads', 'INSERT') then raise exception 'Leads must be added through add_outreach_leads'; end if;
  if has_column_privilege('service_role', 'public.outreach_leads', 'agency_url', 'UPDATE') then raise exception 'Lead details must not be editable'; end if;
  if has_function_privilege('anon', 'public.add_outreach_leads(jsonb, text, text)', 'EXECUTE') or has_function_privilege('authenticated', 'public.add_outreach_leads(jsonb, text, text)', 'EXECUTE') then raise exception 'Browser roles must not add leads'; end if;
end $$;

insert into public.outreach_contacts (sent_by, agency_name, agency_domain, agency_url, contact_email, subject, body_text, delivery, payload_digest)
values ('admin@example.com', 'Old Studio', 'old.example.com', 'https://old.example.com/', 'jo@oldmail.example.com', 'Hi', 'Hi', 'accepted', repeat('a', 64));

set local role service_role;
create temp table result on commit drop as
select * from public.add_outreach_leads($$[
  {"agency_name":"North Studio","agency_url":"https://www.North.example.com/work","contact_email":"Hi@North.example.com","client_store_url":"https://store.example.com","portfolio_source_url":"https://north.example.com/work","fit_note":"Sells a care plan"},
  {"agency_name":"North again","agency_url":"https://north.example.com","client_store_url":"https://store2.example.com","portfolio_source_url":"https://north.example.com/"},
  {"agency_name":"Same contact","agency_url":"https://other.example.com","contact_email":"hi@north.example.com","client_store_url":"https://s.example.com","portfolio_source_url":"https://other.example.com/"},
  {"agency_name":"Old Studio","agency_url":"https://www.old.example.com","client_store_url":"https://s.example.com","portfolio_source_url":"https://old.example.com/"},
  {"agency_name":"Old contact","agency_url":"https://new.example.com","contact_email":"jo@oldmail.example.com","client_store_url":"https://s.example.com","portfolio_source_url":"https://new.example.com/"},
  {"agency_name":"No store","agency_url":"https://nostore.example.com","client_store_url":"","portfolio_source_url":"https://nostore.example.com/"},
  {"agency_name":"Bad URL","agency_url":"javascript:alert(1)","client_store_url":"https://s.example.com","portfolio_source_url":"https://bad.example.com/"},
  {"agency_name":"Bad email","agency_url":"https://email.example.com","contact_email":"nope","client_store_url":"https://s.example.com","portfolio_source_url":"https://email.example.com/"}
]$$::jsonb, 'research', 'Routine@StoreCareHQ.com');
reset role;

do $$
declare outcomes text[];
begin
  select array_agg(outcome order by ord) into outcomes from (select outcome, row_number() over () as ord from result) r;
  if outcomes[1] <> 'added' or outcomes[2] <> 'already listed' or outcomes[3] <> 'already listed' or outcomes[4] <> 'already contacted'
    or outcomes[5] <> 'already contacted' or outcomes[6] not like 'invalid:%' or outcomes[7] not like 'invalid:%' or outcomes[8] not like 'invalid:%' then
    raise exception 'Unexpected outcomes: %', outcomes;
  end if;
  if (select count(*) from public.outreach_leads) <> 1 then raise exception 'Exactly one lead should be added'; end if;
  if not exists (select 1 from public.outreach_leads where agency_domain = 'north.example.com' and contact_email = 'hi@north.example.com'
    and source = 'research' and added_by = 'routine@storecarehq.com' and status = 'new' and not reviewed and fit_note = 'Sells a care plan') then
    raise exception 'Lead saved with unexpected values';
  end if;
end $$;

set local role service_role;
update public.outreach_leads set reviewed = true, status = 'prepared', updated_at = now() where agency_domain = 'north.example.com';
do $$ begin
  begin update public.outreach_leads set agency_url = 'https://evil.example.com' where agency_domain = 'north.example.com'; raise exception 'Unexpected detail edit';
  exception when insufficient_privilege then null; end;
  begin perform public.add_outreach_leads('{}'::jsonb, 'research', 'a@b.co'); raise exception 'Unexpected non-array';
  exception when raise_exception then if sqlerrm <> 'leads must be a JSON array' then raise; end if; end;
  begin perform public.add_outreach_leads('[]'::jsonb, 'spam', 'a@b.co'); raise exception 'Unexpected source';
  exception when raise_exception then if sqlerrm <> 'Unknown lead source' then raise; end if; end;
end $$;
delete from public.outreach_leads where agency_domain = 'north.example.com';
reset role;

set local role anon;
do $$ begin
  begin perform 1 from public.outreach_leads; raise exception 'Unexpected anonymous read'; exception when insufficient_privilege then null; end;
  begin perform public.add_outreach_leads('[]'::jsonb, 'research', 'a@b.co'); raise exception 'Unexpected anonymous add'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;

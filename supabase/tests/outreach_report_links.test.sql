-- Run against an isolated test database after the outreach-report-links migration.
begin;
do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.outreach_report_snapshots'::regclass) then raise exception 'RLS must be enabled'; end if;
  if has_table_privilege('anon', 'public.outreach_report_snapshots', 'SELECT') or has_table_privilege('authenticated', 'public.outreach_report_snapshots', 'SELECT') then raise exception 'Browser roles must not read snapshots'; end if;
  if has_table_privilege('anon', 'public.outreach_report_snapshots', 'INSERT') or has_table_privilege('authenticated', 'public.outreach_report_snapshots', 'INSERT') then raise exception 'Browser roles must not create snapshots'; end if;
  if has_column_privilege('service_role', 'public.outreach_report_snapshots', 'snapshot', 'UPDATE') then raise exception 'Service must not mutate snapshots'; end if;
  if not has_column_privilege('service_role', 'public.outreach_report_snapshots', 'revoked_at', 'UPDATE') then raise exception 'Service must be able to revoke'; end if;
end $$;
set local role anon;
do $$ begin
  begin perform 1 from public.outreach_report_snapshots; raise exception 'Unexpected anonymous read'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role authenticated;
do $$ begin
  begin perform 1 from public.outreach_report_snapshots; raise exception 'Unexpected authenticated read'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
insert into public.outreach_report_snapshots (id,owner_email,health_hash,sample_hash,source_digest,snapshot,created_at,expires_at)
values ('11111111-1111-4111-8111-111111111111','admin@example.com',repeat('a',64),repeat('b',64),repeat('c',64),' {"health":{},"sample":{},"documents":[]}',now(),now()+interval '30 days');
update public.outreach_report_snapshots set revoked_at=now() where id='11111111-1111-4111-8111-111111111111';
-- The app uses 30 * 24 hours, including when the database timezone crosses DST.
insert into public.outreach_report_snapshots (id,owner_email,health_hash,sample_hash,source_digest,snapshot,created_at,expires_at)
values ('33333333-3333-4333-8333-333333333333','admin@example.com',repeat('1',64),repeat('2',64),repeat('3',64),' {"health":{},"sample":{},"documents":[]}','2027-03-20T00:00:00Z','2027-04-19T00:00:00Z');
reset role;
do $$ begin
  begin
    update public.outreach_report_snapshots set snapshot='{"health":{"changed":true},"sample":{},"documents":[]}' where id='11111111-1111-4111-8111-111111111111';
    raise exception 'Unexpected snapshot mutation';
  exception when raise_exception then if sqlerrm <> 'Published report snapshots are immutable' then raise; end if; end;
  begin
    update public.outreach_report_snapshots set revoked_at=null where id='11111111-1111-4111-8111-111111111111';
    raise exception 'Unexpected undo revocation';
  exception when raise_exception then if sqlerrm <> 'Report revocation cannot be undone' then raise; end if; end;
  begin
    insert into public.outreach_report_snapshots (id,owner_email,health_hash,sample_hash,source_digest,snapshot,created_at,expires_at)
    values ('22222222-2222-4222-8222-222222222222','admin@example.com',repeat('d',64),repeat('e',64),repeat('f',64),' {"health":{},"sample":{},"documents":[]}',now(),now()+interval '31 days');
    raise exception 'Unexpected excessive link lifetime';
  exception when check_violation then null; end;
end $$;
rollback;

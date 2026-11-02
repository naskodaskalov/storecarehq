-- Separate from client stores, work entries and operational reports.
create table public.outreach_report_snapshots (
  id uuid primary key,
  owner_email text not null check (owner_email = lower(owner_email) and length(owner_email) between 3 and 320),
  health_hash text not null unique check (health_hash ~ '^[a-f0-9]{64}$'),
  sample_hash text not null unique check (sample_hash ~ '^[a-f0-9]{64}$'),
  source_digest text not null check (source_digest ~ '^[a-f0-9]{64}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and snapshot ?& array['health','sample','documents'] and octet_length(snapshot::text) <= 300000),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  check (health_hash <> sample_hash),
  check (expires_at > created_at and expires_at <= created_at + interval '720 hours')
);
create index outreach_report_owner on public.outreach_report_snapshots (owner_email);
alter table public.outreach_report_snapshots enable row level security;
revoke all on public.outreach_report_snapshots from public, anon, authenticated, service_role;
grant select, insert on public.outreach_report_snapshots to service_role;
grant update (revoked_at) on public.outreach_report_snapshots to service_role;

create function public.preserve_outreach_report_snapshot() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if (to_jsonb(new) - 'revoked_at') is distinct from (to_jsonb(old) - 'revoked_at') then
    raise exception 'Published report snapshots are immutable';
  end if;
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'Report revocation cannot be undone';
  end if;
  return new;
end;
$$;
revoke all on function public.preserve_outreach_report_snapshot() from public, anon, authenticated;
create trigger outreach_report_immutable before update on public.outreach_report_snapshots
for each row execute function public.preserve_outreach_report_snapshot();

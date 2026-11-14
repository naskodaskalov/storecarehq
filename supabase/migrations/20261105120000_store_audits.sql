-- BFCM readiness audits: one dated one-pager per store per run (the "BFCM audit" page).
-- Members of the agency read their audits and create them for their own, unpaused stores while the plan is active.
-- After that an audit is a record of what was checked: only the agency's note, the client link and the sent fields
-- can change. The client opens /r/audit/<token> without an account, through public_audit(), once the agency shares it.

create table public.store_audits (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  kind text not null default 'bfcm' check (kind in ('bfcm')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  audit jsonb not null check (jsonb_typeof(audit) = 'object' and octet_length(audit::text) <= 65536),
  verdict text not null check (verdict in ('fix', 'look', 'ready', 'partial')),
  fixes int not null default 0 check (fixes between 0 and 50),
  looks int not null default 0 check (looks between 0 and 50),
  note text check (char_length(note) <= 1000),
  share_token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  shared_at timestamptz,
  sent_at timestamptz,
  sent_to text check (char_length(sent_to) <= 320)
);
create unique index store_audits_share_token on public.store_audits (share_token);
create index store_audits_store on public.store_audits (store_id, created_at desc);
create index store_audits_agency on public.store_audits (agency_id, created_at desc);

alter table public.store_audits enable row level security;
revoke all on public.store_audits from public, anon, authenticated;
grant select, insert on public.store_audits to authenticated;
grant update (note, shared_at, sent_at, sent_to) on public.store_audits to authenticated;

create policy "agency members read audits" on public.store_audits
  for select to authenticated using (public.is_member(agency_id));

create policy "agency members audit their own stores" on public.store_audits
  for insert to authenticated with check (
    public.is_member(agency_id)
    and created_by = auth.uid()
    and exists (select 1 from public.stores s where s.id = store_id and s.agency_id = store_audits.agency_id and s.status <> 'paused')
    and exists (select 1 from public.agencies a where a.id = store_audits.agency_id and public.agency_has_access(a))
  );

create policy "agency members share and send audits" on public.store_audits
  for update to authenticated using (public.is_member(agency_id)) with check (public.is_member(agency_id));

-- The client's link: one shared audit for a token, with the agency's branding. Never an unshared audit.
create or replace function public.public_audit(token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'audit', sa.audit,
    'note', sa.note,
    'created_at', sa.created_at,
    'store_name', s.name,
    'agency_name', a.name,
    'brand_color', a.brand_color,
    'logo_url', a.logo_url
  )
  from public.store_audits sa
  join public.stores s on s.id = sa.store_id
  join public.agencies a on a.id = sa.agency_id
  where sa.share_token = token
    and length(token) >= 32
    and sa.shared_at is not null;
$$;

revoke all on function public.public_audit(text) from public;
grant execute on function public.public_audit(text) to anon, authenticated;

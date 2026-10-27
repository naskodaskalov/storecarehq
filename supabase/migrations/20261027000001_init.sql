-- StoreCare HQ — phase 1 schema (storefront-first, no Shopify credentials).
-- Every row hangs off an agency. Row-level security lets a signed-in user see only
-- their own agencies' rows. The worker uses the service role and bypasses RLS.

create extension if not exists pgcrypto;

-- Agencies and membership ---------------------------------------------------

create table public.agencies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'trial' check (plan in ('trial', 'solo', 'agency', 'pro')),
  trial_ends_at timestamptz default now() + interval '14 days',
  brand_color text not null default '#2747A8',
  logo_url text,
  sender_email text,
  sender_domain_verified boolean not null default false,
  stores_band text, -- answer from onboarding step 1 ("6–15")
  created_at timestamptz not null default now()
);

create table public.memberships (
  agency_id uuid not null references public.agencies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (agency_id, user_id)
);
create index on public.memberships (user_id);

-- True when the signed-in user belongs to the agency. security definer so policies
-- on memberships itself do not recurse.
create or replace function public.is_member(a uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.agency_id = a and m.user_id = auth.uid()
  );
$$;

-- Creates an agency and makes the caller its owner, in one step (onboarding step 1).
create or replace function public.create_agency(agency_name text, band text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  insert into public.agencies (name, stores_band) values (agency_name, band) returning id into new_id;
  insert into public.memberships (agency_id, user_id, role) values (new_id, auth.uid(), 'owner');
  return new_id;
end;
$$;

-- Stores --------------------------------------------------------------------

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  name text not null,
  public_url text not null,                     -- https://juniperandash.com
  connection text not null default 'storefront' check (connection in ('storefront', 'connector')),
  status text not null default 'active' check (status in ('active', 'limited', 'paused')),
  limited_reason text,                          -- 'blocked', 'headless', 'no_product_feed'
  blocked_streak int not null default 0,        -- consecutive storefront visits that hit a bot check
  timezone text not null default 'UTC',
  client_contact_name text,
  client_contact_email text,
  checkout_consent_at timestamptz,              -- agency confirmed it manages the store and the client agrees to a daily test visit
  checkout_product_handle text,
  checkout_mobile boolean not null default true,
  checkout_desktop boolean not null default true,
  health_score int,
  -- phase 2 (Shopify connector)
  shop_domain text,
  access_token_encrypted bytea,
  created_at timestamptz not null default now(),
  unique (agency_id, public_url)
);
create index on public.stores (agency_id);

create table public.care_plans (
  store_id uuid primary key references public.stores (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  name text not null default 'Care plan',
  hours_included numeric(5, 2) not null default 0,
  rollover_rule text not null default 'one_month' check (rollover_rule in ('one_month', 'expire'))
);

create table public.alert_routes (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies (id) on delete cascade,
  store_id uuid references public.stores (id) on delete cascade, -- null = all stores
  channel text not null check (channel in ('email', 'slack', 'sms')),
  target text not null,
  min_severity text not null default 'incident' check (min_severity in ('info', 'risky', 'incident')),
  night_sms boolean not null default false
);

-- Monitoring data -----------------------------------------------------------

create table public.storefront_snapshots (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  taken_at timestamptz not null default now(),
  theme jsonb,             -- { id, name, schemaName, schemaVersion, ... } or null
  apps jsonb not null default '[]',
  products jsonb,          -- compact list, null when the feed was unreadable
  products_hash text,
  feed_status text not null -- ok | blocked | missing | error | skipped
);
create index on public.storefront_snapshots (store_id, taken_at desc);

create table public.changes (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  source text not null default 'detected' check (source in ('detected', 'work_log', 'connector')),
  kind text not null,
  summary text not null,
  details jsonb not null default '{}',
  risky boolean not null default false,
  work_entry_id uuid
);
create index on public.changes (store_id, occurred_at desc);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  kind text not null check (kind in ('down', 'checkout')),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  cause text,
  linked_change_id bigint references public.changes (id) on delete set null,
  client_note text
);
create index on public.incidents (store_id, opened_at desc);
create unique index one_open_incident_per_kind on public.incidents (store_id, kind) where resolved_at is null;

create table public.checkout_runs (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  ran_at timestamptz not null default now(),
  device text not null check (device in ('mobile', 'desktop')),
  result text not null check (result in ('pass', 'fail', 'blocked')),
  failed_step text,
  detail text,
  steps jsonb not null default '[]' -- [{ step, ok, ms, screenshot_path }]
);
create index on public.checkout_runs (store_id, ran_at desc);

create table public.uptime_checks (
  store_id uuid not null references public.stores (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  checked_at timestamptz not null default now(),
  ok boolean not null,
  status int,
  ms int,
  primary key (store_id, checked_at)
);

create table public.speed_samples (
  store_id uuid not null references public.stores (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  sampled_at timestamptz not null default now(),
  page text not null, -- 'home' | 'product'
  strategy text not null default 'mobile',
  performance_score int,
  lcp_ms int,
  cls numeric,
  tbt_ms int,
  primary key (store_id, sampled_at, page)
);

-- Agency work ----------------------------------------------------------------

create table public.work_entries (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  work_date date not null default current_date,
  minutes int not null check (minutes > 0),
  title text not null,
  client_text text,
  counts_to_plan boolean not null default true,
  incident_id uuid references public.incidents (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.work_entries (store_id, work_date desc);

alter table public.changes
  add constraint changes_work_entry_fk foreign key (work_entry_id) references public.work_entries (id) on delete set null;

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  from_email text,
  subject text not null,
  body text,
  status text not null default 'new' check (status in ('new', 'in_progress', 'done')),
  received_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  period date not null, -- first day of the month
  status text not null default 'draft' check (status in ('draft', 'approved', 'sent')),
  summary_text text,
  facts jsonb,          -- exactly what the summary was written from
  sections jsonb not null default '{}',
  pdf_path text,
  approved_by uuid references auth.users (id),
  sent_at timestamptz,
  unique (store_id, period)
);

-- Row-level security ---------------------------------------------------------

alter table public.agencies enable row level security;
alter table public.memberships enable row level security;

create policy "members read their agencies" on public.agencies
  for select using (public.is_member(id));
create policy "owners update their agencies" on public.agencies
  for update using (exists (
    select 1 from public.memberships m
    where m.agency_id = id and m.user_id = auth.uid() and m.role = 'owner'
  ));

create policy "members read memberships of their agencies" on public.memberships
  for select using (public.is_member(agency_id));

-- Same rule for every agency-scoped table: members can read and write their agency's rows.
do $$
declare
  t text;
begin
  foreach t in array array[
    'stores', 'care_plans', 'alert_routes', 'storefront_snapshots', 'changes', 'incidents',
    'checkout_runs', 'uptime_checks', 'speed_samples', 'work_entries', 'requests', 'reports'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "agency members" on public.%I for all using (public.is_member(agency_id)) with check (public.is_member(agency_id))',
      t
    );
  end loop;
end;
$$;

-- Monitoring tables are written by the worker only; members may read them.
do $$
declare
  t text;
begin
  foreach t in array array['storefront_snapshots', 'checkout_runs', 'uptime_checks', 'speed_samples'] loop
    execute format('drop policy "agency members" on public.%I', t);
    execute format('create policy "agency members read" on public.%I for select using (public.is_member(agency_id))', t);
  end loop;
end;
$$;

-- Keep raw monitoring history bounded (run daily from the worker).
create or replace function public.prune_monitoring()
returns void
language sql
as $$
  delete from public.storefront_snapshots where taken_at < now() - interval '90 days';
  delete from public.uptime_checks where checked_at < now() - interval '13 months';
  delete from public.speed_samples where sampled_at < now() - interval '13 months';
$$;

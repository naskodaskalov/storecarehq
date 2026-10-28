-- More metrics without Shopify access: real-visitor speed and SEO/accessibility scores (same PageSpeed call),
-- and a daily site check (SSL certificate, domain expiry, broken links).

alter table public.speed_samples
  add column if not exists seo_score int,
  add column if not exists accessibility_score int,
  add column if not exists best_practices_score int,
  add column if not exists field_scope text check (field_scope in ('page', 'origin')),
  add column if not exists field_lcp_ms int,
  add column if not exists field_inp_ms int,
  add column if not exists field_cls numeric,
  add column if not exists field_category text;

create table if not exists public.site_checks (
  id bigint generated always as identity primary key,
  store_id uuid not null references public.stores (id) on delete cascade,
  agency_id uuid not null references public.agencies (id) on delete cascade,
  checked_at timestamptz not null default now(),
  ssl_expires_at timestamptz,
  ssl_issuer text,
  ssl_error text,
  domain text,
  domain_expires_at timestamptz,
  domain_error text,
  pages_checked int not null default 0,
  broken jsonb not null default '[]'
);
create index if not exists site_checks_store on public.site_checks (store_id, checked_at desc);

alter table public.site_checks enable row level security;
drop policy if exists "agency members read" on public.site_checks;
create policy "agency members read" on public.site_checks for select using (public.is_member(agency_id));

create or replace function public.prune_monitoring()
returns void
language sql
as $$
  delete from public.storefront_snapshots where taken_at < now() - interval '90 days';
  delete from public.uptime_checks where checked_at < now() - interval '13 months';
  delete from public.speed_samples where sampled_at < now() - interval '13 months';
  delete from public.site_checks where checked_at < now() - interval '13 months';
$$;

-- Uptime totals and average response time for a period, counted in the database.
-- security invoker: row-level security still decides which stores the caller can see.
create or replace function public.uptime_stats(p_store uuid, p_from timestamptz, p_to timestamptz)
returns table (checks bigint, ok bigint, avg_ms int)
language sql
stable
security invoker
set search_path = public
as $$
  select count(*), count(*) filter (where ok), round(avg(ms) filter (where ok))::int
  from public.uptime_checks
  where store_id = p_store and checked_at >= p_from and checked_at < p_to;
$$;
grant execute on function public.uptime_stats(uuid, timestamptz, timestamptz) to authenticated;

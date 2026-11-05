-- Outreach report views: one row each time a public outreach link (/outreach/r/<token>) is opened or downloaded,
-- so the outreach history can show which agencies actually looked at their health check or sample report.
-- No IP address is stored. Opens by mail-security link scanners and crawlers are kept but flagged `automated`,
-- because Outlook/Gmail/Proofpoint-style scanners often open every link the moment an email arrives.
-- Admin views of the same link are not recorded at all (the app skips them).
-- Server-only, like outreach_report_snapshots: browser roles have no access.
create table public.outreach_report_views (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.outreach_report_snapshots (id) on delete cascade,
  kind text not null check (kind in ('health', 'sample', 'health_download', 'sample_download')),
  viewed_at timestamptz not null default now(),
  automated boolean not null default false,
  user_agent text check (length(user_agent) <= 300)
);
create index outreach_report_views_snapshot on public.outreach_report_views (snapshot_id, viewed_at desc);
alter table public.outreach_report_views enable row level security;
revoke all on public.outreach_report_views from public, anon, authenticated, service_role;
grant select, insert on public.outreach_report_views to service_role;

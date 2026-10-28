-- Monthly reports: a private link per report for the client, and a narrow way to read it.

alter table public.reports
  add column if not exists share_token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  add column if not exists summary_source text check (summary_source in ('ai', 'template', 'edited')),
  add column if not exists sent_to text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists reports_share_token on public.reports (share_token);

-- The client opens /r/<token> without an account. Instead of opening the reports table to anonymous
-- users, this function returns one report, only when the token matches and the agency has approved it.
create or replace function public.public_report(token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'period', r.period,
    'status', r.status,
    'summary_text', r.summary_text,
    'facts', r.facts,
    'sections', r.sections,
    'store_name', s.name,
    'agency_name', a.name,
    'brand_color', a.brand_color,
    'logo_url', a.logo_url
  )
  from public.reports r
  join public.stores s on s.id = r.store_id
  join public.agencies a on a.id = r.agency_id
  where r.share_token = token
    and length(token) >= 32
    and r.status in ('approved', 'sent');
$$;

revoke all on function public.public_report(text) from public;
grant execute on function public.public_report(text) to anon, authenticated;

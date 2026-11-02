-- Outreach history: every outreach email sent from /admin/outreach, so the team can see which agencies were already
-- contacted and does not write to the same agency twice by accident.
-- One row per email the provider accepted, or whose acceptance is unconfirmed after a timeout (it may have gone out).
-- Rejected emails are not recorded. An identical email (same recipient, subject, text and report links) is one row:
-- a retry reuses the provider's duplicate-prevention key, and a confirmed retry upgrades an unconfirmed row.
-- Server-only, like outreach_report_snapshots: browser roles have no access; the admin pages use the service role.
create table public.outreach_contacts (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  sent_by text not null check (sent_by = lower(sent_by) and length(sent_by) between 3 and 320),
  agency_name text not null check (length(agency_name) between 1 and 120),
  agency_domain text not null check (agency_domain = lower(agency_domain) and length(agency_domain) between 3 and 253),
  agency_url text not null check (length(agency_url) <= 300),
  contact_name text check (length(contact_name) <= 120),
  contact_email text not null check (contact_email = lower(contact_email) and length(contact_email) between 3 and 320),
  client_store_url text check (length(client_store_url) <= 300),
  subject text not null check (length(subject) between 1 and 200),
  body_text text not null check (length(body_text) <= 20000),
  report_links_id uuid references public.outreach_report_snapshots (id) on delete set null,
  delivery text not null check (delivery in ('accepted', 'unconfirmed')),
  provider_message_id text check (length(provider_message_id) <= 200),
  payload_digest text not null unique check (payload_digest ~ '^[a-f0-9]{64}$')
);
create index outreach_contacts_domain on public.outreach_contacts (agency_domain);
create index outreach_contacts_email on public.outreach_contacts (contact_email);
create index outreach_contacts_sent_at on public.outreach_contacts (sent_at desc);
alter table public.outreach_contacts enable row level security;
revoke all on public.outreach_contacts from public, anon, authenticated, service_role;
grant select, insert on public.outreach_contacts to service_role;
grant update (delivery, provider_message_id) on public.outreach_contacts to service_role;

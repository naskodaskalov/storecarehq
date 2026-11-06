-- Outreach leads: the agencies waiting on /admin/outreach. Saved on the server so the list survives the browser tab
-- and the daily lead research can add to it directly, without a CSV.
-- One row per agency, keyed by its website host (lower-case, without www), the same key as outreach_contacts.
-- Only the list and its workflow state are saved here. Health checks and email drafts stay in the browser tab.
-- Server-only, like outreach_contacts: browser roles have no access; the admin pages use the service role.
create table public.outreach_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null check (source in ('research', 'csv', 'manual', 'backup')),
  added_by text not null check (length(added_by) between 1 and 320),
  agency_name text not null check (length(agency_name) between 1 and 120),
  agency_domain text not null unique check (agency_domain = lower(agency_domain) and agency_domain !~ '^www\.' and length(agency_domain) between 3 and 253),
  agency_url text not null check (agency_url ~ '^https?://' and length(agency_url) <= 300),
  directory_url text check (directory_url ~ '^https?://' and length(directory_url) <= 300),
  contact_name text check (length(contact_name) between 1 and 120),
  contact_email text check (contact_email = lower(contact_email) and contact_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and length(contact_email) <= 320),
  client_store_url text not null check (client_store_url ~ '^https?://' and length(client_store_url) <= 300),
  portfolio_source_url text not null check (portfolio_source_url ~ '^https?://' and length(portfolio_source_url) <= 300),
  fit_note text check (length(fit_note) between 1 and 300),
  reviewed boolean not null default false,
  status text not null default 'new' check (status in ('new', 'prepared', 'contacted', 'replied', 'declined'))
);
create index outreach_leads_created_at on public.outreach_leads (created_at desc);
create index outreach_leads_email on public.outreach_leads (contact_email);
alter table public.outreach_leads enable row level security;
revoke all on public.outreach_leads from public, anon, authenticated, service_role;
grant select, delete on public.outreach_leads to service_role;
grant update (reviewed, status, updated_at) on public.outreach_leads to service_role;
-- New rows come only through add_outreach_leads, so every source gets the same checks and duplicate rules.

create or replace function public.outreach_lead_domain(url text) returns text
language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(lower(substring(url from '^https?://([^/:?#@\s]+)')), '^www\.', ''), '')
$$;

-- Adds agencies to the list. Each lead is a JSON object with the CSV columns (agency_name, agency_url, directory_url,
-- contact_name, contact_email, client_store_url, portfolio_source_url) and an optional fit_note.
-- Skips, without failing the batch: a lead missing a required field or with a bad URL or email, an agency already
-- in the list, and an agency already emailed (same website or contact address in outreach_contacts).
-- Returns one row per input lead, in order, saying what happened to it.
create or replace function public.add_outreach_leads(leads jsonb, lead_source text, added_by text)
returns table (agency_name text, agency_domain text, outcome text, lead_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  lead jsonb;
  v_name text; v_url text; v_dir text; v_contact text; v_email text; v_store text; v_source text; v_note text; v_domain text;
  v_id uuid;
  url_re constant text := '^https?://[^/:?#@\s]+\.[^/:?#@\s]+([/:?#][^\s]*)?$';
begin
  if jsonb_typeof(leads) is distinct from 'array' then raise exception 'leads must be a JSON array'; end if;
  if jsonb_array_length(leads) > 100 then raise exception 'Add at most 100 agencies at a time'; end if;
  if lead_source not in ('research', 'csv', 'manual', 'backup') then raise exception 'Unknown lead source'; end if;
  if coalesce(length(trim(added_by)), 0) not between 1 and 320 then raise exception 'added_by is required'; end if;
  for lead in select value from jsonb_array_elements(leads) loop
    v_name := nullif(trim(lead->>'agency_name'), '');
    v_url := nullif(trim(lead->>'agency_url'), '');
    v_dir := nullif(trim(lead->>'directory_url'), '');
    v_contact := nullif(trim(lead->>'contact_name'), '');
    v_email := lower(nullif(trim(lead->>'contact_email'), ''));
    v_store := nullif(trim(lead->>'client_store_url'), '');
    v_source := nullif(trim(lead->>'portfolio_source_url'), '');
    v_note := nullif(trim(lead->>'fit_note'), '');
    v_domain := public.outreach_lead_domain(v_url);
    agency_name := coalesce(v_name, ''); agency_domain := coalesce(v_domain, ''); lead_id := null;
    if jsonb_typeof(lead) is distinct from 'object' or v_name is null or v_url is null or v_store is null or v_source is null then
      outcome := 'invalid: agency name, agency URL, client store URL and portfolio source URL are required';
    elsif length(v_name) > 120 or coalesce(length(v_contact), 0) > 120 or coalesce(length(v_note), 0) > 300 then
      outcome := 'invalid: a name or note is too long';
    elsif v_url !~ url_re or v_store !~ url_re or v_source !~ url_re or (v_dir is not null and v_dir !~ url_re)
      or greatest(length(v_url), length(v_store), length(v_source), coalesce(length(v_dir), 0)) > 300 or v_domain is null then
      outcome := 'invalid: URLs must be full http(s) addresses';
    elsif v_email is not null and (v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(v_email) > 320) then
      outcome := 'invalid: contact email';
    elsif exists (select 1 from public.outreach_leads l where l.agency_domain = v_domain or (v_email is not null and l.contact_email = v_email)) then
      outcome := 'already listed';
    elsif exists (select 1 from public.outreach_contacts c where c.agency_domain = v_domain or (v_email is not null and c.contact_email = v_email)) then
      outcome := 'already contacted';
    else
      insert into public.outreach_leads (source, added_by, agency_name, agency_domain, agency_url, directory_url, contact_name, contact_email, client_store_url, portfolio_source_url, fit_note)
      values (lead_source, lower(trim(added_by)), v_name, v_domain, v_url, v_dir, v_contact, v_email, v_store, v_source, v_note)
      on conflict on constraint outreach_leads_agency_domain_key do nothing
      returning id into v_id;
      if v_id is null then outcome := 'already listed'; else outcome := 'added'; lead_id := v_id; end if;
    end if;
    return next;
  end loop;
end $$;
revoke execute on function public.add_outreach_leads(jsonb, text, text) from public, anon, authenticated;
grant execute on function public.add_outreach_leads(jsonb, text, text) to service_role;
revoke execute on function public.outreach_lead_domain(text) from public, anon, authenticated;

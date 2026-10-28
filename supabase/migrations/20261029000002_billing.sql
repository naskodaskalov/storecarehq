-- Billing: 7-day free trial without a card, then a Stripe subscription.
-- Plans differ only by store count: Solo 5, Agency 20, Pro 50. The trial allows 20.

alter table public.agencies alter column trial_ends_at set default now() + interval '7 days';

alter table public.agencies
  add column if not exists stripe_customer_id text unique,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status text, -- Stripe's status: active, past_due, canceled, …
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false;

-- Members may edit their agency's profile, never its plan, trial or billing fields. Those are written
-- only by the Stripe webhook (service role) and by security-definer functions.
revoke update on public.agencies from authenticated, anon;
grant update (name, brand_color, logo_url, sender_email, stores_band) on public.agencies to authenticated;

create or replace function public.plan_store_limit(p_plan text)
returns int
language sql
immutable
as $$
  select case p_plan when 'solo' then 5 when 'agency' then 20 when 'pro' then 50 else 20 end;
$$;

-- Paying (a past_due card gets Stripe's retry window) or still inside the free trial.
create or replace function public.agency_has_access(a public.agencies)
returns boolean
language sql
stable
as $$
  select coalesce(a.subscription_status in ('active', 'trialing', 'past_due'), false)
      or coalesce(a.trial_ends_at > now(), false);
$$;

create or replace function public.check_store_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.agencies;
  lim int;
  n int;
  paying boolean;
begin
  select * into a from public.agencies where id = new.agency_id;
  if a.id is null then return new; end if; -- the foreign key reports this
  if not public.agency_has_access(a) then
    raise exception 'Your free trial has ended. Choose a plan to add stores.' using errcode = 'P0001', hint = 'billing';
  end if;
  paying := coalesce(a.subscription_status in ('active', 'trialing', 'past_due'), false);
  lim := public.plan_store_limit(case when paying then a.plan else 'trial' end);
  select count(*) into n from public.stores where agency_id = new.agency_id;
  if n >= lim then
    raise exception '% includes up to % stores. Change your plan to add more.',
      case when paying then initcap(a.plan) || ' plan' else 'The free trial' end, lim
      using errcode = 'P0001', hint = 'billing';
  end if;
  return new;
end;
$$;

drop trigger if exists stores_limit on public.stores;
create trigger stores_limit before insert on public.stores
  for each row execute function public.check_store_limit();

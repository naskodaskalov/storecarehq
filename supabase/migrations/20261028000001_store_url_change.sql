-- When a store's address changes, its storefront snapshots describe a different site, and the next
-- diff would report the whole store as changed. Snapshots are worker-written (members can only read
-- them), so the reset happens here, in the database. Checks history (uptime, speed, checkout) is kept.

create or replace function public.reset_storefront_on_url_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.public_url is distinct from old.public_url then
    delete from public.storefront_snapshots where store_id = new.id;
    new.status := case when old.status = 'paused' then 'paused' else 'active' end;
    new.limited_reason := null;
    new.blocked_streak := 0;
    new.health_score := null;
  end if;
  return new;
end;
$$;

drop trigger if exists stores_url_change on public.stores;
create trigger stores_url_change
  before update of public_url on public.stores
  for each row execute function public.reset_storefront_on_url_change();

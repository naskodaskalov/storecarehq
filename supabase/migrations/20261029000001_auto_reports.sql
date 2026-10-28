-- Monthly reports drafted automatically by the worker on the 1st (store time).
-- The worker never overwrites an existing report: (store_id, period) is unique and it inserts "on conflict do nothing".

alter table public.reports add column if not exists auto_drafted_at timestamptz;

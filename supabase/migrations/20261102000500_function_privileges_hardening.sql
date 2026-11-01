-- Security advisor clean-up before launch.
--
-- Functions in the public schema are executable by PUBLIC by default, and PostgREST exposes them as
-- /rest/v1/rpc/<name>. Narrow each one to who actually calls it.

-- Trigger functions run when their trigger fires; EXECUTE is only checked when the trigger is created.
-- Nobody needs to call them directly.
revoke execute on function public.check_store_limit() from public, anon, authenticated;
revoke execute on function public.reset_storefront_on_url_change() from public, anon, authenticated;

-- Creating an agency requires a signed-in user (the function also checks auth.uid()).
revoke execute on function public.create_agency(text, text) from public, anon;
grant execute on function public.create_agency(text, text) to authenticated;

-- Retention runs from the worker as the database owner, never from the API.
revoke execute on function public.prune_monitoring() from public, anon, authenticated;

-- Fixed search paths: each body uses only its arguments, built-ins or schema-qualified names.
alter function public.agency_has_access(public.agencies) set search_path = '';
alter function public.plan_store_limit(text) set search_path = '';
alter function public.prune_monitoring() set search_path = '';

-- Intentionally unchanged (advisor warnings expected):
--   is_member(uuid): used by row-level security policies that apply to every role; returns false
--     without a signed-in user, so revoking it would turn empty results into errors.
--   public_report(text): the client's report link works without an account; the token is the key.
--   request_health_check(uuid), retry_alert_delivery(uuid): signed-in actions that check membership.

-- Preserve the existing trigger definition and permissions; only change its link origin.
do $migration$
declare
  definition text;
begin
  definition := pg_get_functiondef('public.queue_monitor_event()'::regprocedure);
  definition := replace(definition, 'https://www.storecarehq.com/stores/', 'https://app.storecarehq.com/stores/');
  definition := replace(definition, 'https://storecarehq.vercel.app/stores/', 'https://app.storecarehq.com/stores/');
  execute definition;
end;
$migration$;

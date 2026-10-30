import type { SupabaseClient } from '@supabase/supabase-js';
export type HealthCheckActionState = { error: string | null; requestId: string | null };
const allowed = new Set(['Sign in to request a health check.', 'Store unavailable.', 'Resume monitoring before running a health check.', 'Choose an active plan before running a health check.', 'Please wait five minutes between health checks.']);
export async function queueHealthCheck(client: Pick<SupabaseClient,'auth'|'rpc'>, id: string): Promise<HealthCheckActionState> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { error: 'Store unavailable.', requestId: null };
  try {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return { error: 'Sign in to request a health check.', requestId: null };
    const { data, error } = await client.rpc('request_health_check', { p_store: id });
    if (error || !data) return { error: allowed.has(error?.message ?? '') ? error!.message : 'Could not queue a health check. Please try again.', requestId: null };
    return { error: null, requestId: String(data) };
  } catch { return { error: 'Could not queue a health check. Please try again.', requestId: null }; }
}

'use server';
import { supabaseServer } from '@/lib/supabase';
import { isDemo } from '@/lib/demo';
import { queueHealthCheck, type HealthCheckActionState } from '@/lib/health-check-request';
export async function requestHealthCheck(_previous: HealthCheckActionState, form: FormData): Promise<HealthCheckActionState> {
  const id = String(form.get('store') ?? '');
  if (isDemo()) return { error: 'Connect a real workspace to run health checks.', requestId: null };
  const supabase = await supabaseServer();
  return queueHealthCheck(supabase,id);
}

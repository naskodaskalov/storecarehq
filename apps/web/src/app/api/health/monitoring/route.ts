import { supabaseAdmin } from '@/lib/supabase-admin';
import { handleMonitoringHealth, type Freshness } from '@/lib/monitoring-health';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return handleMonitoringHealth(request, {
    token: process.env.MONITORING_STATUS_TOKEN || undefined,
    read: async () => {
      const { data, error } = await supabaseAdmin().rpc('monitoring_freshness');
      if (error || !data) throw new Error('monitoring_freshness failed');
      return data as Freshness;
    },
  });
}

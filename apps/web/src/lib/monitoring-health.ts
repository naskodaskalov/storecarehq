// GET /api/health/monitoring: 200 while monitoring runs, 503 when it has stopped. Point an external uptime monitor
// (UptimeRobot, Better Stack, Healthchecks…) at it so a stalled scheduler or worker pages a person.
// Public on purpose, so the reply says only whether monitoring is healthy, never which stores or agencies.

export type Freshness = { eligible: number; stale: number; last_check_minutes: number | null; waiting_health_checks: number };
type Config = { read: () => Promise<Freshness>; token?: string };

const headers = { 'cache-control': 'no-store' };

export function verdict(f: Freshness): { ok: boolean; problem: string | null } {
  if (f.stale > 0) return { ok: false, problem: 'Stores are missing recent uptime checks.' };
  if (f.waiting_health_checks > 0) return { ok: false, problem: 'Requested health checks have waited over 30 minutes.' };
  return { ok: true, problem: null };
}

export async function handleMonitoringHealth(request: Request, config: Config): Promise<Response> {
  if (config.token && new URL(request.url).searchParams.get('token') !== config.token) {
    return Response.json({ ok: false, problem: 'Not allowed.' }, { status: 401, headers });
  }
  let f: Freshness;
  try {
    f = await config.read();
  } catch {
    return Response.json({ ok: false, problem: 'Could not read monitoring status.' }, { status: 503, headers });
  }
  const v = verdict(f);
  return Response.json({ ...v, last_check_minutes: f.last_check_minutes }, { status: v.ok ? 200 : 503, headers });
}

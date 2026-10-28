// Decides which jobs are due for a store. Used by the run-once-per-tick runner (GitHub Actions),
// which may start late or skip a beat, so it compares against what last ran instead of the clock alone.

export type JobName = 'uptime' | 'storefront' | 'checkout' | 'speed' | 'site';

export type LastRuns = {
  snapshotAt: Date | null;
  checkoutAt: Date | null;
  speedAt: Date | null;
  siteAt?: Date | null;
};

export type StoreForSchedule = { timezone: string; checkout_consent_at: Date | null };

const MIN = 60_000;
export const STOREFRONT_EVERY_MS = 50 * MIN; // hourly, with slack for late runs
export const DAILY_AFTER_HOUR = 6; // store-local time

/** "2026-10-28" and the hour, in the store's timezone. */
export function localDateHour(tz: string, at: Date): { date: string; hour: number } {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at);
  } catch {
    return localDateHour('UTC', at);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

/** Due once per local day, at or after DAILY_AFTER_HOUR. */
function dailyDue(tz: string, last: Date | null, now: Date): boolean {
  const today = localDateHour(tz, now);
  if (today.hour < DAILY_AFTER_HOUR) return false;
  if (!last) return true;
  return localDateHour(tz, last).date !== today.date;
}

export function dueJobs(store: StoreForSchedule, last: LastRuns, now = new Date()): JobName[] {
  const jobs: JobName[] = ['uptime'];
  if (!last.snapshotAt || now.getTime() - last.snapshotAt.getTime() >= STOREFRONT_EVERY_MS) jobs.push('storefront');
  // The checkout test needs a product from the first snapshot, so it waits for one.
  if (store.checkout_consent_at && last.snapshotAt && dailyDue(store.timezone, last.checkoutAt, now)) jobs.push('checkout');
  if (dailyDue(store.timezone, last.speedAt, now)) jobs.push('speed');
  if (dailyDue(store.timezone, last.siteAt ?? null, now)) jobs.push('site');
  return jobs;
}

// Decides which jobs are due for a store. Used by the run-once-per-tick runner (GitHub Actions),
// which may start late or skip a beat, so it compares against what last ran instead of the clock alone.

import { monthPeriod, previousPeriod } from '@storecare/reports';

export type JobName = 'uptime' | 'storefront' | 'checkout' | 'speed' | 'site' | 'report';

export type LastRuns = {
  snapshotAt: Date | null;
  checkoutAt: Date | null;
  speedAt: Date | null;
  siteAt?: Date | null;
  /** Months (YYYY-MM-01) that already have a report for this store, recent first. */
  reportPeriods?: string[];
};

export type StoreForSchedule = { timezone: string; checkout_consent_at: Date | null; created_at?: Date | null };

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

/** Monthly reports are drafted from 06:00 store time on the 1st, catching up until the 5th
 *  (the same window in which the Reports page defaults to last month). */
export const REPORT_LAST_DAY = 5;

/** The month a report would be drafted for now: last month, in the store's timezone. */
export function reportPeriodFor(tz: string, now = new Date()) {
  return previousPeriod(monthPeriod(localDateHour(tz, now).date));
}

function reportDue(store: StoreForSchedule, last: LastRuns, now: Date): boolean {
  const { date, hour } = localDateHour(store.timezone, now);
  const day = Number(date.slice(8));
  if (day > REPORT_LAST_DAY || (day === 1 && hour < DAILY_AFTER_HOUR)) return false;
  const period = reportPeriodFor(store.timezone, now);
  if (store.created_at && store.created_at.getTime() >= Date.parse(`${period.end}T00:00:00Z`)) return false;
  return !(last.reportPeriods ?? []).includes(period.start);
}

export function dueJobs(store: StoreForSchedule, last: LastRuns, now = new Date()): JobName[] {
  const jobs: JobName[] = ['uptime'];
  if (!last.snapshotAt || now.getTime() - last.snapshotAt.getTime() >= STOREFRONT_EVERY_MS) jobs.push('storefront');
  // The checkout test needs a product from the first snapshot, so it waits for one.
  if (store.checkout_consent_at && last.snapshotAt && dailyDue(store.timezone, last.checkoutAt, now)) jobs.push('checkout');
  if (dailyDue(store.timezone, last.speedAt, now)) jobs.push('speed');
  if (dailyDue(store.timezone, last.siteAt ?? null, now)) jobs.push('site');
  if (last.reportPeriods && reportDue(store, last, now)) jobs.push('report');
  return jobs;
}

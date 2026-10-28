import type { Period } from './types.ts';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The month containing `date` (YYYY-MM-DD or YYYY-MM), as [first day, first day of next month). */
export function monthPeriod(date: string): Period {
  const [y, m] = date.slice(0, 7).split('-').map(Number);
  const start = `${y}-${String(m).padStart(2, '0')}-01`;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  const end = `${ny}-${String(nm).padStart(2, '0')}-01`;
  return { start, end, label: `${MONTHS[m - 1]} ${y}` };
}

export function previousPeriod(p: Period): Period {
  const [y, m] = p.start.split('-').map(Number);
  return monthPeriod(m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`);
}

/** Which month a report drafted today is about: in the first 5 days, last month; otherwise this month so far. */
export function defaultReportPeriod(today = new Date()): Period {
  const iso = today.toISOString().slice(0, 10);
  const p = monthPeriod(iso);
  return today.getUTCDate() <= 5 ? previousPeriod(p) : p;
}

export function dayLabel(iso: string, tz = 'UTC'): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: tz });
}

// The hero's "your client's report" preview: what a checked store's monthly report looks like on day one,
// written only from what the visitor's own checks saw. Client-safe, pure, tested.

import type { ScanSummary } from './scan.ts';
import { MANY_APPS, SLOW_MS } from './scan-findings.ts';
import { shortDate, type Fingerprint, type StoreMemory } from './store-memory.ts';

const s = (n: number) => (n === 1 ? '' : 's');
const list = (parts: string[]) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`);

/** "Autumn (Dawn 15.0.0)", "Dawn 15.0.0" */
export function themeLabel(t: Fingerprint['theme']): string | null {
  if (!t) return null;
  const base = t.schema && t.schema !== t.name ? `${t.schema}${t.version ? ` ${t.version}` : ''}` : t.version ?? '';
  if (!t.name) return base ? `a custom theme (${base})` : 'a custom theme';
  return t.schema && t.schema !== t.name ? `${t.name} (${base})` : `${t.name}${t.version ? ` ${t.version}` : ''}`;
}

export const storeName = (scan: ScanSummary, memory?: StoreMemory | null) => scan.siteName ?? memory?.name ?? scan.host;

/** Three sentences in the agency's voice, like the real report's summary, from the visitor's checks only. */
export function previewSummary(scan: ScanSummary, memory: StoreMemory, month: string): string {
  const name = storeName(scan, memory);
  const tail = `From here we test checkout every morning and note every change, so this report fills in as ${month} goes on.`;
  if (memory.looks.length > 1) {
    const n = memory.changes.length;
    const top = memory.changes.find((c) => c.risky) ?? memory.changes.at(-1);
    const same = [
      memory.last.theme ? 'same theme' : '',
      scan.appCount ? `same ${scan.appCount} app${s(scan.appCount)}` : '',
      scan.products && !scan.products.more ? `same ${scan.products.count} product${s(scan.products.count)}` : '',
    ].filter(Boolean);
    const middle = n
      ? `In that time we noted ${n} change${s(n)}, the most significant being “${top!.summary}”.`
      : `Nothing changed in that time${same.length ? `: ${list(same)}` : ''}.`;
    return `We have checked ${name} ${memory.looks.length} times since ${shortDate(memory.looks[0])}. ${middle} ${tail}`;
  }
  if (!scan.fp.home) return `On our first check, ${name}’s firewall turned the visit away, so some checks would be limited. ${tail}`;
  const theme = themeLabel(scan.fp.theme);
  const facts = [
    `${name}’s home page answered in ${(scan.responseMs / 1000).toFixed(1)}s`,
    theme ? `the live theme is ${theme}` : '',
    scan.appCount ? `${scan.appCount} app${s(scan.appCount)} load${scan.appCount === 1 ? 's' : ''} on every page` : '',
  ].filter(Boolean);
  return `On our first check, ${list(facts)}. ${tail}`;
}

export type Recommendation = { title: string; detail: string };

/** At most three, most useful first, in the same voice and with the same thresholds as the report and the findings. */
export function previewRecommendations(scan: ScanSummary, memory: StoreMemory): Recommendation[] {
  const out: Recommendation[] = [];
  const risky = memory.changes.filter((c) => c.risky).length;
  if (risky) {
    out.push({
      title: 'Tell us before big changes',
      detail: `${risky === 1 ? 'One significant change was' : `${risky} significant changes were`} made to the store since ${shortDate(memory.looks[0])}. A heads-up before theme switches or bulk price edits lets us check checkout right after.`,
    });
  }
  if (scan.responseMs >= SLOW_MS) {
    out.push({
      title: 'Speed up the first load',
      detail: `The home page took ${(scan.responseMs / 1000).toFixed(1)}s to start loading on our check. Shoppers on mobile feel anything over two seconds.`,
    });
  }
  if (scan.appCount >= MANY_APPS) {
    out.push({
      title: 'Review apps and scripts',
      detail: `${scan.appCount} apps and services load on every page${scan.unknownApps ? `, ${scan.unknownApps} of them from services we couldn’t identify` : ''}. Removing unused ones usually helps load time.`,
    });
  } else if (scan.unknownApps) {
    out.push({
      title: 'Confirm unrecognised scripts',
      detail: `${scan.unknownApps} script${s(scan.unknownApps)} come${scan.unknownApps === 1 ? 's' : ''} from services we couldn’t identify. Worth confirming each one is still wanted.`,
    });
  }
  if (scan.soldOut) {
    out.push({
      title: 'Review sold-out products',
      detail: `${scan.soldOut} product${s(scan.soldOut)} still list${scan.soldOut === 1 ? 's' : ''} sold-out sizes or variants. Hiding them or adding back-in-stock alerts keeps visitors from dead ends.`,
    });
  }
  return out.slice(0, 3);
}

const UPTIME_EVERY_MS = 30 * 60_000;
const DAILY_HOUR = 6;

/** Where this month's report stands now, and what StoreCare would add to it before it drafts on the 1st. */
export function reportClock(now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const daysInMonth = Math.round((end.getTime() - start.getTime()) / 864e5);
  let daily = 0;
  for (let d = now.getDate(); d <= daysInMonth; d++) if (new Date(now.getFullYear(), now.getMonth(), d, DAILY_HOUR) > now) daily++;
  const month = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const draft = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  const next = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const nextDays = Math.round((next.getTime() - end.getTime()) / 864e5);
  return {
    month: month(start),
    monthName: start.toLocaleDateString('en-GB', { month: 'long' }),
    start,
    end,
    /** How far through the month we are, 0–1. */
    progress: (now.getTime() - start.getTime()) / (end.getTime() - start.getTime()),
    draftsOn: draft(end),
    uptimeLeft: Math.floor((end.getTime() - now.getTime()) / UPTIME_EVERY_MS),
    dailyLeft: daily,
    /** Too little of this month left for a meaningful first report: talk about next month's instead. */
    late: daily < 3,
    next: { month: month(end), draftsOn: draft(next), uptime: nextDays * 48, daily: nextDays },
  };
}

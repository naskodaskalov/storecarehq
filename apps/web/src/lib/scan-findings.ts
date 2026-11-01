// What a landing-page store check is worth mentioning, and a note an agency can send the owner.
// Client-safe: types only from scan.ts, no storefront code.

import type { ScanSummary } from './scan.ts';

export type Finding = { tone: 'look' | 'good'; text: string };

// Thresholds for the scan's findings. Deliberately conservative: one visit can't prove a problem,
// so everything is phrased as "worth a look", never as a fault.
export const SLOW_MS = 2000;
export const QUICK_MS = 800;
export const MANY_APPS = 12;

/** What one look at a store is worth mentioning, from the scan alone. Looks first, then what's fine. */
export function findings(s: ScanSummary): Finding[] {
  const look: Finding[] = [];
  const good: Finding[] = [];
  const secs = (s.responseMs / 1000).toFixed(1);
  if (s.responseMs >= SLOW_MS) look.push({ tone: 'look', text: `The home page took ${secs}s to start loading. Shoppers on mobile feel anything over two seconds.` });
  else if (s.responseMs < QUICK_MS) good.push({ tone: 'good', text: `The home page answered in ${secs}s.` });
  if (s.appCount >= MANY_APPS) look.push({ tone: 'look', text: `${s.appCount} apps and services load on every page. Each adds weight; some may no longer be used.` });
  else if (s.appCount > 0) good.push({ tone: 'good', text: `A lean set of ${s.appCount} app${s.appCount === 1 ? '' : 's'} on the storefront.` });
  if (s.unknownApps > 0) look.push({ tone: 'look', text: `${s.unknownApps} script${s.unknownApps === 1 ? ' comes' : 's come'} from services we don’t recognise. Worth confirming each one is wanted.` });
  if (s.soldOut) look.push({ tone: 'look', text: `${s.soldOut} product${s.soldOut === 1 ? ' has' : 's have'} sold-out sizes or variants still listed.` });
  if (s.theme) good.push({ tone: 'good', text: `Live theme identified: ${s.theme}.` });
  return [...look, ...good];
}

/** A short, plain note an agency can send the store owner after checking their store. */
export function checkupNote(s: ScanSummary, agency: string, list: Finding[] = findings(s)): string {
  const from = agency.trim();
  const looks = list.filter((f) => f.tone === 'look');
  const bullets = looks.length ? looks : list;
  const lines = [
    `Hi,`,
    ``,
    `${from ? `I’m with ${from}. ` : ''}I ran a quick outside check on ${s.host}, the kind a visitor’s browser does, no access needed.`,
    ``,
    looks.length ? `A few things worth a look:` : bullets.length ? `It’s in good shape from the outside:` : `Nothing stood out on a first look.`,
    ...bullets.map((f) => `• ${f.text}`),
    ``,
    `This was a single look. Stores change every week: apps get added, themes get published, checkout breaks after an update. ` +
      `We watch stores like yours every 30 minutes, test the checkout daily, and send a short report on the 1st of each month.`,
    ``,
    `Happy to walk you through it on a 15-minute call.`,
    ...(from ? [``, from] : []),
  ];
  return lines.join('\n');
}

export const PORTFOLIO_MAX = 5;

/** Store addresses pasted as a list (lines, commas or spaces), tidied, de-duplicated and capped. */
export function parseStoreList(text: string, max = PORTFOLIO_MAX): { stores: string[]; dropped: number } {
  const seen = new Set<string>();
  for (const raw of text.split(/[\s,;]+/)) {
    const host = raw.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/^www\./, '');
    if (host.includes('.')) seen.add(host);
  }
  const all = [...seen];
  return { stores: all.slice(0, max), dropped: Math.max(0, all.length - max) };
}

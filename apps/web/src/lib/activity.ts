// Every client store's changes and incidents in one log, newest first. Pure, so it can be tested;
// the Overview page loads the rows (lib/data.ts) and the client component keeps it live.

import { whenLabel } from './day.ts';

export type ActivityTone = 'risk' | 'good' | 'plain';
export type ActivityKind = 'change' | 'incident';
export type ActivityLine = {
  id: string;
  at: string;
  /** "Today 06:02", "Yesterday 18:47" or "28 Oct 09:14" in the store's time zone; the page re-labels it in the viewer's. */
  when: string;
  store: string;
  text: string;
  tone: ActivityTone;
  kind: ActivityKind;
  /** Needs the agency: an incident, or a significant change not in the work log. */
  flagged: boolean;
  href: string;
};

export type ActivityInput = {
  now: Date;
  stores: { id: string; name: string; timezone: string | null }[];
  changes: { id: number | string; store_id: string; occurred_at: string; summary: string; risky: boolean; work_entry_id: string | null }[];
  incidents: { id: string; store_id: string; kind: string; opened_at: string; resolved_at: string | null; cause: string | null }[];
  limit?: number;
};

export function activityLines(i: ActivityInput): ActivityLine[] {
  const stores = new Map(i.stores.map((s) => [s.id, s]));
  const out: ActivityLine[] = [];
  const line = (storeId: string, l: Omit<ActivityLine, 'when' | 'store'>) => {
    const s = stores.get(storeId);
    if (!s) return;
    out.push({ ...l, store: s.name, when: whenLabel(l.at, i.now, s.timezone || 'UTC') });
  };

  for (const c of i.changes) {
    const matched = !!c.work_entry_id;
    const flagged = c.risky && !matched;
    line(c.store_id, {
      id: `c${c.id}`,
      at: c.occurred_at,
      text: matched ? `${c.summary}, matched to your work log` : flagged ? `${c.summary}, not in your work log` : c.summary,
      tone: flagged ? 'risk' : 'plain',
      kind: 'change',
      flagged,
      href: `/stores/${c.store_id}?change=${c.id}#change-details`,
    });
  }

  for (const inc of i.incidents) {
    const down = inc.kind === 'down';
    const href = `/stores/${inc.store_id}#store-overview`;
    line(inc.store_id, {
      id: `i${inc.id}`,
      at: inc.opened_at,
      text: `${down ? 'Store unreachable' : 'Checkout test failed'}${inc.cause ? `: ${inc.cause}` : ''}${inc.resolved_at ? '' : ' · still open'}`,
      tone: 'risk',
      kind: 'incident',
      flagged: true,
      href,
    });
    if (inc.resolved_at) {
      const mins = Math.max(1, Math.round((Date.parse(inc.resolved_at) - Date.parse(inc.opened_at)) / 60000));
      line(inc.store_id, {
        id: `r${inc.id}`,
        at: inc.resolved_at,
        text: down ? `Store back up after ${mins} min` : `Checkout test passed again, fixed in ${mins} min`,
        tone: 'good',
        kind: 'incident',
        flagged: false,
        href,
      });
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id)).slice(0, i.limit ?? 40);
}

// The dashboard's morning brief: everything that wants the agency today, in the order to do it,
// and where each care plan's hours are heading by the end of the month. Pure, so it can be tested.

export type BriefStore = { id: string; name: string; status: string; included: number; usedMinutes: number };
export type BriefInput = {
  stores: BriefStore[];
  incidents: { id: string; store_id: string; kind: string; cause: string | null; opened_at: string }[];
  changes: { id: number | string; store_id: string; summary: string; risky: boolean; work_entry_id: unknown; occurred_at: string }[];
  checkouts: { store_id: string; result: string; ran_at: string }[];
  reports: { id: string; store_id: string; status: string; period: string }[];
  now: Date;
};

export type BriefItem = {
  key: string;
  tone: 'danger' | 'warning' | 'info';
  store: string;
  title: string;
  detail: string;
  href: string;
  action: string;
};

export type Pace = {
  /** Hours used so far, and the plan. */
  used: number;
  included: number;
  /** Where usage "should" be today if hours were spread evenly. */
  expected: number;
  /** Hours by the end of the month at the current rate; null while it is too early to say. */
  projected: number | null;
  state: 'over' | 'heading-over' | 'on-pace' | 'quiet' | 'early' | 'no-plan';
};

/** Day of month before which a forecast is noise. */
const FORECAST_FROM_DAY = 5;
const round1 = (n: number) => Math.round(n * 10) / 10;

export function monthProgress(now: Date) {
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return { fraction: (now.getTime() - start) / (end - start), day: now.getUTCDate(), endLabel: new Date(end - 1).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) };
}

export function pace(store: Pick<BriefStore, 'included' | 'usedMinutes'>, now: Date): Pace {
  const used = round1(store.usedMinutes / 60);
  const included = store.included;
  const { fraction, day } = monthProgress(now);
  if (!included) return { used, included, expected: 0, projected: null, state: 'no-plan' };
  const expected = round1(included * fraction);
  if (used > included) return { used, included, expected, projected: day >= FORECAST_FROM_DAY ? round1(used / fraction) : null, state: 'over' };
  if (day < FORECAST_FROM_DAY) return { used, included, expected, projected: null, state: 'early' };
  const projected = round1(used / fraction);
  if (projected > included * 1.1) return { used, included, expected, projected, state: 'heading-over' };
  // Past mid-month with under a quarter of the plan used: the client sees little for their money.
  if (fraction >= 0.5 && used < included * 0.25) return { used, included, expected, projected, state: 'quiet' };
  return { used, included, expected, projected, state: 'on-pace' };
}

/** Everything that wants the agency today, most urgent first. */
export function briefItems(b: BriefInput): BriefItem[] {
  const name = new Map(b.stores.map((s) => [s.id, s.name]));
  const active = new Set(b.stores.filter((s) => s.status !== 'paused').map((s) => s.id));
  const items: BriefItem[] = [];
  const incidentStores = new Set(b.incidents.map((i) => i.store_id));

  for (const i of b.incidents) {
    items.push({
      key: `incident-${i.id}`,
      tone: 'danger',
      store: name.get(i.store_id) ?? 'A store',
      title: i.kind === 'down' ? 'Store is down' : 'Checkout test is failing',
      detail: i.cause ? `${i.cause}. Open since ${hhmm(i.opened_at)}.` : `Open since ${hhmm(i.opened_at)}.`,
      href: `/stores/${i.store_id}`,
      action: 'Investigate',
    });
  }

  // A failed checkout without an incident yet (one failure; the alert waits for a second).
  const latest = new Map<string, { result: string; ran_at: string }>();
  for (const c of b.checkouts) if (!latest.has(c.store_id)) latest.set(c.store_id, c);
  for (const [storeId, c] of latest) {
    if (c.result !== 'fail' || incidentStores.has(storeId) || !active.has(storeId)) continue;
    items.push({ key: `checkout-${storeId}`, tone: 'warning', store: name.get(storeId) ?? 'A store', title: 'Checkout test failed once', detail: `At ${hhmm(c.ran_at)}. An alert follows if the next test fails too.`, href: `/stores/${storeId}`, action: 'Check it' });
  }

  const unexplained = b.changes.filter((c) => c.risky && !c.work_entry_id && active.has(c.store_id));
  for (const c of unexplained.slice(0, 5)) {
    items.push({ key: `change-${c.id}`, tone: 'warning', store: name.get(c.store_id) ?? 'A store', title: c.summary, detail: 'Not in your work log. Log it if it was you; ask the client if it wasn’t.', href: `/stores/${c.store_id}?change=${c.id}#change-details`, action: 'View change' });
  }

  for (const r of b.reports.filter((r) => r.status === 'draft')) {
    items.push({ key: `report-${r.id}`, tone: 'info', store: name.get(r.store_id) ?? 'A store', title: 'Monthly report ready to approve', detail: 'Drafted from the month’s checks and your work log. Nothing reaches the client until you approve it.', href: `/reports/${r.id}`, action: 'Review' });
  }

  const { endLabel } = monthProgress(b.now);
  for (const s of b.stores) {
    if (s.status === 'paused') continue;
    const p = pace(s, b.now);
    if (p.state === 'heading-over') {
      items.push({ key: `pace-${s.id}`, tone: 'info', store: s.name, title: `Heading for ${p.projected}h of a ${p.included}h plan`, detail: `At this rate the plan runs out before ${endLabel}. A word with the client now beats a surprise invoice.`, href: `/stores/${s.id}`, action: 'See work' });
    } else if (p.state === 'quiet') {
      items.push({ key: `pace-${s.id}`, tone: 'info', store: s.name, title: `Only ${p.used}h of ${p.included}h used this month`, detail: 'Quiet months are when clients start asking what they pay for. Log the checks you did, or send a short update.', href: `/stores/${s.id}`, action: 'Log work' });
    }
  }
  return items;
}

/** One sentence for the top of the page. */
export function briefHeadline(b: BriefInput, items: BriefItem[]): string {
  const watched = b.stores.filter((s) => s.status !== 'paused').length;
  const urgent = items.filter((i) => i.tone !== 'info').length;
  const rest = items.length - urgent;
  if (!items.length) return `${watched === 1 ? 'Your store is' : `All ${watched} stores are`} quiet. Nothing needs you right now.`;
  const parts = [
    urgent ? `${urgent} ${urgent === 1 ? 'thing needs' : 'things need'} you now` : '',
    rest ? `${rest} can wait until later` : '',
  ].filter(Boolean);
  const quiet = watched - new Set(items.filter((i) => i.tone !== 'info').map((i) => i.store)).size;
  return `${parts.join(', ')}. ${quiet > 0 ? `${quiet} of ${watched} stores ${quiet === 1 ? 'needs' : 'need'} nothing from you.` : ''}`.trim();
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';

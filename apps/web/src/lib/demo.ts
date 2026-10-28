// Demo mode (STORECARE_DEMO=1): an in-memory stand-in for the Supabase client with a sample agency,
// so the app can be shown and reviewed without a Supabase project. Supports only the query
// features the app uses. Data lives in process memory and resets on restart.

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Tables = Record<string, Row[]>;

const DAY = 864e5;
const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const dateOnly = (msAgo: number) => iso(msAgo).slice(0, 10);
let seq = 1000;
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

const USER = { id: '00000000-0000-4000-8000-000000000001', email: 'nasko@northline.studio' };
const AGENCY = '00000000-0000-4000-8000-0000000000a1';

function seed(): Tables {
  const stores = [
    { name: 'Juniper & Ash', url: 'https://juniperandash.com', health: 94, hours: 10, tz: 'Europe/London', contact: 'Maya Ortiz' },
    { name: 'Ferro Coffee', url: 'https://ferrocoffee.co', health: 68, hours: 8, tz: 'Europe/Berlin', contact: 'Jonas Ferro' },
    { name: 'Bloom Botanics', url: 'https://bloombotanics.com', health: 81, hours: 6, tz: 'America/New_York', contact: 'Ava Chen' },
    { name: 'Kite & Kin', url: 'https://kiteandkin.com', health: 97, hours: 6, tz: 'Europe/London', contact: null },
    { name: 'Saltgrass Swim', url: 'https://saltgrassswim.com', health: 91, hours: 10, tz: 'Australia/Sydney', contact: 'Liv Harper' },
    { name: 'Ostra Ceramics', url: 'https://ostraceramics.eu', health: null, hours: 4, tz: 'Europe/Sofia', contact: null, limited: 'blocked' },
  ].map((s, i) => ({
    id: `00000000-0000-4000-8000-0000000005${i}0`,
    agency_id: AGENCY,
    name: s.name,
    public_url: s.url,
    connection: 'storefront',
    status: s.limited ? 'limited' : 'active',
    limited_reason: s.limited ?? null,
    blocked_streak: s.limited ? 4 : 0,
    timezone: s.tz,
    client_contact_name: s.contact,
    client_contact_email: s.contact ? `${s.contact.split(' ')[0].toLowerCase()}@${s.url.replace('https://', '')}` : null,
    checkout_consent_at: s.limited ? null : iso(40 * DAY),
    checkout_product_handle: i === 0 ? 'hearthwood-candle-300g' : null,
    checkout_mobile: true,
    checkout_desktop: true,
    health_score: s.health,
    created_at: iso((40 - i) * DAY),
    _hours: s.hours,
  }));
  const [juniper, ferro, bloom, kite, salt] = stores;

  const care_plans = stores.map((s) => ({
    store_id: s.id,
    agency_id: AGENCY,
    name: s._hours >= 10 ? 'Care Plan Growth' : 'Care Plan Essentials',
    hours_included: s._hours,
    rollover_rule: 'one_month',
  }));

  const work_entries: Row[] = [
    { store: juniper, ago: 6 * DAY, minutes: 90, title: 'Published autumn theme after testing checkout', client: 'Launched the autumn homepage and tested checkout on mobile and desktop.' },
    { store: juniper, ago: 13 * DAY, minutes: 45, title: 'Removed 2 unused apps and their leftover scripts', client: 'Cleaned up two apps you no longer use; pages load faster.' },
    { store: juniper, ago: 14 * DAY, minutes: 120, title: 'Fixed add to cart after reviews app update', client: 'Fixed the mobile add-to-cart issue within 34 minutes.' },
    { store: juniper, ago: 20 * DAY, minutes: 180, title: 'Black Friday readiness check', client: 'Tested discount codes, shipping rates and the free-gift threshold ahead of November.' },
    { store: ferro, ago: 1 * DAY, minutes: 150, title: 'Investigating blank payment step on mobile', client: null },
    { store: ferro, ago: 9 * DAY, minutes: 240, title: 'Subscription app migration', client: 'Moved subscriptions to the new app.' },
    { store: ferro, ago: 16 * DAY, minutes: 150, title: 'Wholesale price list update', client: null },
    { store: bloom, ago: 4 * DAY, minutes: 120, title: 'New FAQ section on shipping', client: null },
    { store: bloom, ago: 11 * DAY, minutes: 120, title: 'Product page image optimisation', client: null },
    { store: kite, ago: 8 * DAY, minutes: 210, title: 'Holiday collection pages', client: null },
    { store: salt, ago: 3 * DAY, minutes: 330, title: 'Summer sale prices and banners', client: 'Set up summer sale pricing.' },
    { store: salt, ago: 15 * DAY, minutes: 300, title: 'Size guide app setup', client: null },
  ].map((w) => ({
    id: uid(),
    store_id: w.store.id,
    agency_id: AGENCY,
    user_id: USER.id,
    work_date: dateOnly(w.ago),
    minutes: w.minutes,
    title: w.title,
    client_text: w.client,
    counts_to_plan: true,
    incident_id: null,
    created_at: iso(w.ago),
  }));
  const entry = (title: string) => work_entries.find((w) => w.title === title)?.id ?? null;

  const changes: Row[] = [
    { store: juniper, ago: 1 * DAY + 3 * 3600e3, kind: 'products_added', summary: '3 new products published', risky: false },
    { store: juniper, ago: 6 * DAY, kind: 'theme_published', summary: 'New live theme: "Dawn – Autumn"', risky: true, entry: 'Published autumn theme after testing checkout' },
    { store: juniper, ago: 10 * DAY, kind: 'app_added', summary: 'Smile.io added', risky: false },
    { store: juniper, ago: 13 * DAY, kind: 'app_removed', summary: 'Privy removed', risky: false, entry: 'Removed 2 unused apps and their leftover scripts' },
    { store: juniper, ago: 20 * DAY, kind: 'prices_changed', summary: 'Prices changed on 42 products', risky: true, note: 'no zero or extreme prices found' },
    { store: ferro, ago: 1 * DAY + 2 * 3600e3, kind: 'app_added', summary: 'cdn.paywidget-pro.io added', risky: false },
    { store: ferro, ago: 2 * DAY, kind: 'prices_changed', summary: 'Prices changed on 18 products', risky: true, note: '1 price at zero or moved more than 3x' },
    { store: bloom, ago: 1 * DAY, kind: 'theme_published', summary: 'New live theme: "Prestige – Winter test"', risky: true },
    { store: bloom, ago: 3 * DAY, kind: 'app_added', summary: 'Klaviyo added', risky: false },
    { store: salt, ago: 3 * DAY, kind: 'prices_changed', summary: 'Prices changed on 64 products', risky: true, note: 'no zero or extreme prices found', entry: 'Summer sale prices and banners' },
    { store: kite, ago: 5 * DAY, kind: 'products_added', summary: '12 new products published', risky: false, entry: 'Holiday collection pages' },
  ].map((c, i) => ({
    id: i + 1,
    store_id: c.store.id,
    agency_id: AGENCY,
    occurred_at: iso(c.ago),
    source: 'detected',
    kind: c.kind,
    summary: c.summary,
    details: c.note ? { note: c.note } : {},
    risky: c.risky,
    work_entry_id: c.entry ? entry(c.entry) : null,
  }));

  const incidents: Row[] = [
    { id: uid(), store_id: ferro.id, agency_id: AGENCY, kind: 'checkout', opened_at: iso(10 * 3600e3), resolved_at: null, cause: 'mobile: checkout — did not reach checkout (payment step shows a blank page)' },
    { id: uid(), store_id: juniper.id, agency_id: AGENCY, kind: 'checkout', opened_at: iso(13 * DAY + 18 * 3600e3), resolved_at: iso(13 * DAY + 17.4 * 3600e3), cause: 'mobile: add to cart — cart/add.js returned 422' },
  ];

  const checkout_runs: Row[] = [];
  for (const s of [juniper, ferro, bloom, kite, salt]) {
    for (let d = 13; d >= 0; d--) {
      const fail = (s === juniper && d === 13) || (s === ferro && d === 0);
      checkout_runs.push({
        id: checkout_runs.length + 1,
        store_id: s.id,
        agency_id: AGENCY,
        ran_at: iso(d * DAY + (d === 0 ? 3 * 3600e3 : 0)),
        device: 'mobile',
        result: fail ? 'fail' : 'pass',
        failed_step: fail ? (s === ferro ? 'checkout' : 'add_to_cart') : null,
        detail: null,
        steps: [],
      });
    }
  }

  const uptime_checks: Row[] = [];
  for (const s of stores) {
    for (let k = 0; k < 288; k++) uptime_checks.push({ store_id: s.id, agency_id: AGENCY, checked_at: iso(k * 2.5 * 3600e3), ok: !(s === bloom && k === 40), status: 200, ms: 400 });
  }

  const speed_samples: Row[] = stores.flatMap((s, i) => [
    { store_id: s.id, agency_id: AGENCY, sampled_at: iso(0.2 * DAY), page: 'home', strategy: 'mobile', performance_score: 70 + i * 3, lcp_ms: s === bloom ? 3900 : 2100 + i * 150, cls: 0.03, tbt_ms: 200 },
    { store_id: s.id, agency_id: AGENCY, sampled_at: iso(1.2 * DAY), page: 'home', strategy: 'mobile', performance_score: 68 + i * 3, lcp_ms: s === bloom ? 3100 : 2900 + i * 100, cls: 0.04, tbt_ms: 240 },
  ]);

  const storefront_snapshots: Row[] = stores.slice(0, 5).map((s, i) => ({
    id: i + 1,
    store_id: s.id,
    agency_id: AGENCY,
    taken_at: iso(0.5 * 3600e3),
    feed_status: 'ok',
    theme:
      s === juniper
        ? { id: 141234567890, name: 'Dawn – Autumn', schemaName: 'Dawn', schemaVersion: '15.2.0' }
        : s === bloom
          ? { id: 1, name: 'Prestige – Winter test', schemaName: 'Prestige', schemaVersion: '10.4.0' }
          : { id: 2, name: 'Production', schemaName: 'Impulse', schemaVersion: '7.6.1' },
    apps: (s === juniper
      ? ['Klaviyo', 'Judge.me', 'Smile.io', 'Gorgias', 'Recharge', 'Meta Pixel', 'Google Tag Manager', 'Pushowl', 'Loop Returns', 'Rebuy', 'Afterpay', 'Hotjar']
      : ['Klaviyo', 'Okendo', 'Meta Pixel', 'Google Tag Manager', 'TikTok Pixel', 'Attentive', 'cdn.paywidget-pro.io'].slice(0, 5 + (i % 3))
    ).map((name) => ({ key: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, known: !name.includes('.'), evidence: [] })),
  }));

  return {
    agencies: [{ id: AGENCY, name: 'Northline Studio', plan: 'agency', brand_color: '#2747A8', created_at: iso(41 * DAY) }],
    memberships: [{ agency_id: AGENCY, user_id: USER.id, role: 'owner' }],
    stores: stores.map(({ _hours, ...s }) => s),
    care_plans,
    alert_routes: [{ id: uid(), agency_id: AGENCY, store_id: null, channel: 'email', target: USER.email, min_severity: 'incident' }],
    work_entries,
    changes,
    incidents,
    checkout_runs,
    uptime_checks,
    speed_samples,
    storefront_snapshots,
    reports: [],
  };
}

const g = globalThis as unknown as { __storecareDemo?: Tables };
const db = (): Tables => (g.__storecareDemo ??= seed());

/** Embedded relations the app selects, e.g. "care_plans(hours_included)". */
const RELATIONS: Record<string, (row: Row, t: Tables) => Row | null> = {
  care_plans: (r, t) => t.care_plans.find((c) => c.store_id === r.id) ?? null,
  work_entries: (r, t) => (r.work_entry_id ? (t.work_entries.find((w) => w.id === r.work_entry_id) ?? null) : null),
  stores: (r, t) => t.stores.find((s) => s.id === r.store_id) ?? null,
};

type Result = { data: any; error: null | { message: string }; count?: number | null }; // eslint-disable-line @typescript-eslint/no-explicit-any

class Query implements PromiseLike<Result> {
  private filters: ((r: Row) => boolean)[] = [];
  private sorts: [string, boolean][] = [];
  private max: number | null = null;
  private one = false;
  private embeds: string[] = [];
  private countOnly = false;
  private wantCount = false;
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: Row | Row[] | null = null;

  constructor(private table: string) {}

  select(cols = '*', opts: { count?: string; head?: boolean } = {}) {
    this.embeds = [...cols.matchAll(/(\w+)\(/g)].map((m) => m[1]);
    this.wantCount = !!opts.count;
    this.countOnly = !!opts.head;
    return this;
  }
  insert(values: Row | Row[]) {
    this.op = 'insert';
    this.payload = values;
    return this;
  }
  update(values: Row) {
    this.op = 'update';
    this.payload = values;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(c: string, v: unknown) { this.filters.push((r) => r[c] === v); return this; }
  is(c: string, v: null) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  not(c: string, _op: 'is', v: null) { this.filters.push((r) => (r[c] ?? null) !== v); return this; }
  gte(c: string, v: string) { this.filters.push((r) => String(r[c]) >= v); return this; }
  lt(c: string, v: string) { this.filters.push((r) => String(r[c]) < v); return this; }
  in(c: string, v: unknown[]) { this.filters.push((r) => v.includes(r[c])); return this; }
  order(c: string, o: { ascending?: boolean } = {}) { this.sorts.push([c, o.ascending ?? true]); return this; }
  limit(n: number) { this.max = n; return this; }
  single() { this.one = true; return this; }

  private run(): Result {
    const t = db();
    const rows = (t[this.table] ??= []);
    if (this.op === 'insert') {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((v) => ({
        id: this.table === 'changes' ? rows.length + 1 : uid(),
        created_at: new Date().toISOString(),
        ...v,
      }));
      rows.push(...list);
      return { data: this.one ? list[0] : list, error: null };
    }
    let out = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === 'update') {
      // Same reset as the stores_url_change trigger.
      if (this.table === 'stores' && this.payload && 'public_url' in this.payload) {
        for (const r of out) {
          if (r.public_url !== (this.payload as Row).public_url) {
            t.storefront_snapshots = t.storefront_snapshots.filter((s) => s.store_id !== r.id);
            Object.assign(r, { limited_reason: null, blocked_streak: 0, health_score: null, status: r.status === 'paused' ? 'paused' : 'active' });
          }
        }
      }
      for (const r of out) Object.assign(r, this.payload);
      return { data: out, error: null };
    }
    if (this.op === 'delete') {
      const gone = new Set(out);
      t[this.table] = rows.filter((r) => !gone.has(r));
      // Cascade like the foreign keys do.
      if (this.table === 'stores') {
        const ids = new Set(out.map((r) => r.id));
        for (const name of Object.keys(t)) if (name !== 'stores') t[name] = t[name].filter((r) => !ids.has(r.store_id));
      }
      return { data: out, error: null };
    }
    for (const [c, asc] of [...this.sorts].reverse()) {
      out = [...out].sort((a, b) => (a[c] === b[c] ? 0 : (a[c] > b[c] ? 1 : -1) * (asc ? 1 : -1)));
    }
    const count = out.length;
    if (this.max !== null) out = out.slice(0, this.max);
    const shaped = out.map((r) => {
      const copy = { ...r };
      for (const e of this.embeds) copy[e] = RELATIONS[e]?.(r, t) ?? null;
      return copy;
    });
    if (this.countOnly) return { data: null, error: null, count };
    if (this.one) return shaped[0] ? { data: shaped[0], error: null } : { data: null, error: { message: 'not found' } };
    return { data: shaped, error: null, count: this.wantCount ? count : null };
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.run()).then(ok, fail);
  }
}

export function demoClient() {
  return {
    from: (table: string) => new Query(table),
    rpc: async (fn: string, args: Row) => {
      if (fn !== 'create_agency') return { data: null, error: { message: `unknown rpc ${fn}` } };
      const id = uid();
      db().agencies.push({ id, name: args.agency_name, plan: 'trial', brand_color: '#2747A8', created_at: new Date().toISOString() });
      return { data: id, error: null };
    },
    auth: {
      getUser: async () => ({ data: { user: USER }, error: null }),
      signInWithOtp: async () => ({ data: {}, error: null }),
      exchangeCodeForSession: async () => ({ data: {}, error: null }),
    },
  };
}

export const isDemo = () => process.env.STORECARE_DEMO === '1';

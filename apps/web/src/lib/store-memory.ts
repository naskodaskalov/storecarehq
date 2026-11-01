// The landing page remembers the stores a visitor checks, in their own browser only, so the next check can say
// what changed in between. Client-safe and dependency-free: the scan endpoint builds the fingerprint, this file
// compares two of them with the same rules and wording as the product's change feed (packages/storefront/src/diff.ts).

/** A compact picture of one check: enough to tell what changed next time, without keeping page contents. */
export type Fingerprint = {
  /** When the check ran (ISO). */
  at: string;
  /** The home page was read (not blocked): theme and apps only compare between readable checks. */
  home: boolean;
  /** Time to the first response from the home page. */
  ms: number;
  theme: { id: number | null; name: string | null; schema: string | null; version: string | null } | null;
  /** Every app or service seen on the storefront, as [key, name]. */
  apps: [string, string][];
  /** The public product list, when readable. `all` is false when the store has more products than one page. */
  feed: {
    all: boolean;
    /** Product id → [price key, sold-out variants, variants]. */
    p: Record<string, [string, number, number]>;
    /** Titles of products with every variant sold out, by id. */
    out: Record<string, string>;
  } | null;
};

export type ChangeKind =
  | 'theme_published'
  | 'theme_updated'
  | 'app_added'
  | 'app_removed'
  | 'products_added'
  | 'products_removed'
  | 'prices_changed'
  | 'stock_out'
  | 'stock_back';

export type StoreChange = { at: string; kind: ChangeKind; summary: string; risky: boolean };

export type StoreMemory = {
  host: string;
  name: string | null;
  /** When the visitor looked at this store (ISO), oldest first. */
  looks: string[];
  /** The latest readable state, the baseline for the next check. */
  last: Fingerprint;
  /** Changes found between checks, oldest first. */
  changes: StoreChange[];
};

/** Same thresholds as the product's change feed. */
export const BULK_THRESHOLD = 10;
const MAX_LOOKS = 60;
const MAX_CHANGES = 40;
/** Checking again within ten minutes is the same look, not a second one. */
const SAME_LOOK_MS = 10 * 60_000;

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;
const isOut = (p: [string, number, number] | undefined) => !!p && p[2] > 0 && p[1] >= p[2];

/** What changed between two checks of one store. Mirrors diffSnapshots: same kinds, order and summaries. */
export function diffFingerprints(prev: Fingerprint, next: Fingerprint): StoreChange[] {
  const out: StoreChange[] = [];
  const add = (kind: ChangeKind, summary: string, risky: boolean) => out.push({ at: next.at, kind, summary, risky });

  if (prev.home && next.home) {
    if (prev.theme && next.theme) {
      if (prev.theme.id !== next.theme.id) add('theme_published', `New live theme: "${next.theme.name ?? 'Untitled'}"`, true);
      else if (prev.theme.version !== next.theme.version && next.theme.version)
        add('theme_updated', `Theme updated to ${next.theme.schema ?? 'version'} ${next.theme.version}`, true);
    }
    const before = new Map(prev.apps);
    const after = new Map(next.apps);
    for (const [key, name] of after) if (!before.has(key)) add('app_added', `${name} added`, false);
    for (const [key, name] of before) if (!after.has(key)) add('app_removed', `${name} removed`, false);
  }

  if (prev.feed && next.feed) {
    const p0 = prev.feed.p;
    const p1 = next.feed.p;
    // With only the first page of a large catalogue, a product missing from one side may just be on page two.
    if (prev.feed.all && next.feed.all) {
      const added = Object.keys(p1).filter((id) => !(id in p0)).length;
      const removed = Object.keys(p0).filter((id) => !(id in p1)).length;
      if (added) add('products_added', `${plural(added, 'new product')} published`, false);
      if (removed) add('products_removed', `${plural(removed, 'product')} unpublished or deleted`, removed >= BULK_THRESHOLD);
    }
    // A price key covers every variant's price; a product whose variants were added or removed isn't counted.
    const repriced = Object.keys(p1).filter((id) => p0[id] && p0[id][2] === p1[id][2] && p0[id][0] !== p1[id][0]).length;
    if (repriced) add('prices_changed', `Prices changed on ${plural(repriced, 'product')}`, repriced >= BULK_THRESHOLD);

    const wentOut = Object.keys(p1).filter((id) => p0[id] && !isOut(p0[id]) && isOut(p1[id]));
    const cameBack = Object.keys(p1).filter((id) => p0[id] && isOut(p0[id]) && !isOut(p1[id]));
    if (wentOut.length) {
      const title = next.feed.out[wentOut[0]];
      add('stock_out', wentOut.length === 1 && title ? `Out of stock: ${title}` : `${wentOut.length} products went out of stock`, false);
    }
    if (cameBack.length) {
      const title = prev.feed.out[cameBack[0]];
      add('stock_back', cameBack.length === 1 && title ? `Back in stock: ${title}` : `${cameBack.length} products are back in stock`, false);
    }
  }
  return out;
}

/** Add a check to what we know about a store. Returns the updated memory and the changes this check found. */
export function remember(prev: StoreMemory | undefined, host: string, name: string | null, fp: Fingerprint): { memory: StoreMemory; found: StoreChange[] } {
  if (!prev) return { memory: { host, name, looks: [fp.at], last: fp, changes: [] }, found: [] };
  const found = diffFingerprints(prev.last, fp);
  // Keep the last readable theme, apps and products as the baseline when this check couldn't read them.
  const last: Fingerprint = {
    ...fp,
    home: fp.home || prev.last.home,
    theme: fp.home ? fp.theme : prev.last.theme,
    apps: fp.home ? fp.apps : prev.last.apps,
    feed: fp.feed ?? prev.last.feed,
  };
  const latest = prev.looks.at(-1);
  const sameLook = !!latest && Date.parse(fp.at) - Date.parse(latest) < SAME_LOOK_MS;
  const looks = sameLook ? prev.looks : [...prev.looks, fp.at];
  return {
    memory: {
      host,
      name: name ?? prev.name,
      looks: looks.length > MAX_LOOKS ? [looks[0], ...looks.slice(-(MAX_LOOKS - 1))] : looks,
      last,
      changes: [...prev.changes, ...found].slice(-MAX_CHANGES),
    },
    found,
  };
}

// ---- Storage: this browser only. Every call tolerates storage being blocked, full or holding old data. ----

const KEY = 'storecare:checked-stores:v1';
export const MAX_STORES = 8;
/** Fired on window when the remembered stores change, so other parts of the page can refresh. */
export const STORES_EVENT = 'storecare:stores';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function browserStorage(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

const isFingerprint = (f: unknown): f is Fingerprint =>
  !!f && typeof f === 'object' && typeof (f as Fingerprint).at === 'string' && Array.isArray((f as Fingerprint).apps);

const isMemory = (m: unknown): m is StoreMemory =>
  !!m &&
  typeof m === 'object' &&
  typeof (m as StoreMemory).host === 'string' &&
  Array.isArray((m as StoreMemory).looks) &&
  (m as StoreMemory).looks.length > 0 &&
  (m as StoreMemory).looks.every((l) => typeof l === 'string') &&
  isFingerprint((m as StoreMemory).last) &&
  Array.isArray((m as StoreMemory).changes);

const lastLook = (m: StoreMemory) => Date.parse(m.looks.at(-1)!) || 0;

/** Remembered stores, most recently checked first. */
export function loadStores(store: Store | null = browserStorage()): StoreMemory[] {
  try {
    const data = JSON.parse(store?.getItem(KEY) ?? 'null') as { v?: number; stores?: unknown[] } | null;
    if (data?.v !== 1 || !Array.isArray(data.stores)) return [];
    return data.stores.filter(isMemory).sort((a, b) => lastLook(b) - lastLook(a));
  } catch {
    return [];
  }
}

/** Save one store's memory (most recent first, at most eight). Returns what is now remembered. */
export function saveStore(memory: StoreMemory, store: Store | null = browserStorage()): StoreMemory[] {
  const list = [memory, ...loadStores(store).filter((s) => s.host !== memory.host)].slice(0, MAX_STORES);
  // If the browser is short of space, keep fewer stores rather than none.
  for (const keep of [list.length, 3, 1]) {
    try {
      store?.setItem(KEY, JSON.stringify({ v: 1, stores: list.slice(0, keep) }));
      notify();
      return list.slice(0, keep);
    } catch {
      /* try with fewer */
    }
  }
  return list;
}

/** Forget one store. */
export function forgetStore(host: string, store: Store | null = browserStorage()) {
  const rest = loadStores(store).filter((s) => s.host !== host);
  try {
    if (rest.length) store?.setItem(KEY, JSON.stringify({ v: 1, stores: rest }));
    else store?.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
  notify();
}

export function forgetStores(store: Store | null = browserStorage()) {
  try {
    store?.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
  notify();
}

function notify() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(STORES_EVENT));
}

/** "earlier today", "yesterday" or "on 29 Oct", in the visitor's time zone. */
export function whenLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(now) - day(d)) / 864e5);
  if (days <= 0) return 'earlier today';
  if (days === 1) return 'yesterday';
  return `on ${shortDate(iso)}`;
}

/** "29 Oct" */
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

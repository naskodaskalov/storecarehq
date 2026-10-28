// Reads the public /products.json feed and turns it into a compact snapshot for diffing.

import { politeGet, type HostClock } from './http.ts';

export type ProductLite = {
  id: number;
  handle: string;
  title: string;
  updatedAt: string | null;
  /** variant id → price as a string, exactly as Shopify sends it ("19.00"). */
  prices: Record<string, string>;
  /** IDs of variants that are sold out. Missing on snapshots taken before stock tracking existed. */
  soldOut?: string[];
};

/** A product is out of stock when it has variants and none of them can be bought. */
export function isOutOfStock(p: ProductLite): boolean {
  if (!p.soldOut) return false;
  const variants = Object.keys(p.prices).length;
  return variants > 0 && p.soldOut.length >= variants;
}

export type ProductFeed =
  | { status: 'ok'; products: ProductLite[]; pages: number; truncated: boolean }
  | { status: 'blocked' | 'missing' | 'error'; httpStatus: number; detail?: string };

type RawVariant = { id: number; price: string; available?: boolean };
type RawProduct = { id: number; handle: string; title: string; updated_at?: string; variants?: RawVariant[] };

export function toLite(p: RawProduct): ProductLite {
  const prices: Record<string, string> = {};
  const soldOut: string[] = [];
  for (const v of p.variants ?? []) {
    prices[String(v.id)] = String(v.price);
    if (v.available === false) soldOut.push(String(v.id));
  }
  return { id: p.id, handle: p.handle, title: p.title, updatedAt: p.updated_at ?? null, prices, soldOut };
}

export async function fetchProductFeed(
  baseUrl: string,
  opts: { clock?: HostClock; gapMs?: number; maxPages?: number } = {},
): Promise<ProductFeed> {
  const maxPages = opts.maxPages ?? 20;
  const products: ProductLite[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await politeGet(`${baseUrl}/products.json?limit=250&page=${page}`, {
      clock: opts.clock,
      gapMs: opts.gapMs,
      accept: 'application/json',
    });
    if (res.blocked) return { status: 'blocked', httpStatus: res.status };
    if (res.status === 404) return { status: 'missing', httpStatus: 404 };
    if (!res.ok) return { status: 'error', httpStatus: res.status, detail: res.error };
    let parsed: { products?: RawProduct[] };
    try {
      parsed = JSON.parse(res.body);
    } catch {
      // Some stores redirect /products.json to an HTML page.
      return { status: 'missing', httpStatus: res.status, detail: 'not JSON' };
    }
    const batch = parsed.products ?? [];
    products.push(...batch.map(toLite));
    if (batch.length < 250) return { status: 'ok', products, pages: page, truncated: false };
  }
  return { status: 'ok', products, pages: maxPages, truncated: true };
}

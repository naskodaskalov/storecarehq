// Daily: mobile lab metrics from the PageSpeed Insights API for the home page and the test product.

import type { Db, StoreRow } from '../db.ts';

export type SpeedSample = { performanceScore: number | null; lcpMs: number | null; cls: number | null; tbtMs: number | null };

type Audit = { numericValue?: number };
type PsiResponse = {
  lighthouseResult?: {
    categories?: { performance?: { score?: number | null } };
    audits?: Record<string, Audit | undefined>;
  };
};

export function parsePsi(json: PsiResponse): SpeedSample {
  const lr = json.lighthouseResult;
  const n = (k: string) => {
    const v = lr?.audits?.[k]?.numericValue;
    return typeof v === 'number' ? v : null;
  };
  const score = lr?.categories?.performance?.score;
  return {
    performanceScore: typeof score === 'number' ? Math.round(score * 100) : null,
    lcpMs: n('largest-contentful-paint') === null ? null : Math.round(n('largest-contentful-paint')!),
    cls: n('cumulative-layout-shift'),
    tbtMs: n('total-blocking-time') === null ? null : Math.round(n('total-blocking-time')!),
  };
}

export async function fetchPsi(url: string, key = process.env.PAGESPEED_API_KEY): Promise<SpeedSample> {
  const api = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  api.searchParams.set('url', url);
  api.searchParams.set('strategy', 'mobile');
  api.searchParams.set('category', 'performance');
  if (key) api.searchParams.set('key', key);
  const res = await fetch(api, { signal: AbortSignal.timeout(90000) });
  if (!res.ok) throw new Error(`PageSpeed API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return parsePsi((await res.json()) as PsiResponse);
}

export async function runSpeed(db: Db, store: StoreRow, psi: (url: string) => Promise<SpeedSample> = (u) => fetchPsi(u)) {
  const pages: [string, string][] = [['home', `${store.public_url}/`]];
  if (store.checkout_product_handle) pages.push(['product', `${store.public_url}/products/${store.checkout_product_handle}`]);
  const out: Record<string, SpeedSample> = {};
  for (const [page, url] of pages) {
    const s = await psi(url);
    out[page] = s;
    await db.query(
      `insert into public.speed_samples (store_id, agency_id, sampled_at, page, strategy, performance_score, lcp_ms, cls, tbt_ms)
       values ($1, $2, now(), $3, 'mobile', $4, $5, $6, $7)`,
      [store.id, store.agency_id, page, s.performanceScore, s.lcpMs, s.cls, s.tbtMs],
    );
  }
  return out;
}

// Daily: one PageSpeed Insights call per page gives three things:
// - lab metrics (a test phone loading the page now),
// - field metrics from the Chrome UX Report (real Chrome visitors over the last 28 days, only for stores with
//   enough traffic; Google does not say how much),
// - SEO, accessibility and best-practice scores.

import type { Db, StoreRow } from '../db.ts';

export type SpeedSample = {
  performanceScore: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  seoScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  /** Real-visitor data (75th percentile), from the page if available, otherwise the whole site. */
  field: { scope: 'page' | 'origin'; lcpMs: number | null; inpMs: number | null; cls: number | null; category: string | null } | null;
};

type Audit = { numericValue?: number };
type FieldMetric = { percentile?: number; category?: string };
type Experience = { metrics?: Record<string, FieldMetric | undefined>; overall_category?: string };
type PsiResponse = {
  lighthouseResult?: {
    categories?: Record<string, { score?: number | null } | undefined>;
    audits?: Record<string, Audit | undefined>;
  };
  loadingExperience?: Experience;
  originLoadingExperience?: Experience;
};

const score = (v: number | null | undefined) => (typeof v === 'number' ? Math.round(v * 100) : null);

function parseField(e: Experience | undefined, scope: 'page' | 'origin'): SpeedSample['field'] {
  const m = e?.metrics;
  if (!m || !Object.keys(m).length) return null;
  const p = (k: string) => (typeof m[k]?.percentile === 'number' ? m[k]!.percentile! : null);
  const clsRaw = p('CUMULATIVE_LAYOUT_SHIFT_SCORE');
  return {
    scope,
    lcpMs: p('LARGEST_CONTENTFUL_PAINT_MS'),
    inpMs: p('INTERACTION_TO_NEXT_PAINT'),
    cls: clsRaw === null ? null : clsRaw / 100, // CrUX reports CLS × 100
    category: e?.overall_category ?? null,
  };
}

export function parsePsi(json: PsiResponse): SpeedSample {
  const lr = json.lighthouseResult;
  const n = (k: string) => {
    const v = lr?.audits?.[k]?.numericValue;
    return typeof v === 'number' ? v : null;
  };
  const round = (v: number | null) => (v === null ? null : Math.round(v));
  return {
    performanceScore: score(lr?.categories?.performance?.score),
    lcpMs: round(n('largest-contentful-paint')),
    cls: n('cumulative-layout-shift'),
    tbtMs: round(n('total-blocking-time')),
    seoScore: score(lr?.categories?.seo?.score),
    accessibilityScore: score(lr?.categories?.accessibility?.score),
    bestPracticesScore: score(lr?.categories?.['best-practices']?.score),
    field: parseField(json.loadingExperience, 'page') ?? parseField(json.originLoadingExperience, 'origin'),
  };
}

export async function fetchPsi(url: string, key = process.env.PAGESPEED_API_KEY): Promise<SpeedSample> {
  const api = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
  api.searchParams.set('url', url);
  api.searchParams.set('strategy', 'mobile');
  for (const c of ['performance', 'seo', 'accessibility', 'best-practices']) api.searchParams.append('category', c);
  if (key) api.searchParams.set('key', key);
  const res = await fetch(api, { signal: AbortSignal.timeout(120000) });
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
      `insert into public.speed_samples
         (store_id, agency_id, sampled_at, page, strategy, performance_score, lcp_ms, cls, tbt_ms,
          seo_score, accessibility_score, best_practices_score,
          field_scope, field_lcp_ms, field_inp_ms, field_cls, field_category)
       values ($1, $2, now(), $3, 'mobile', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        store.id, store.agency_id, page, s.performanceScore, s.lcpMs, s.cls, s.tbtMs,
        s.seoScore, s.accessibilityScore, s.bestPracticesScore,
        s.field?.scope ?? null, s.field?.lcpMs ?? null, s.field?.inpMs ?? null, s.field?.cls ?? null, s.field?.category ?? null,
      ],
    );
  }
  return out;
}

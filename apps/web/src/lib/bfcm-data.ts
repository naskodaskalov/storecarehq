// Runs one client store's BFCM audit on the server: the latest monitoring rows (read as the signed-in user, so
// row-level security applies), one light live visit (robots.txt, the home page and up to three products it
// promotes), and live SSL/domain checks only when the daily site check is missing or stale.
// Demo mode answers the live part from canned results, so nothing reaches the sample stores' real domains.

import { checkCertificate, domainExpiry, probeStore } from '@storecare/storefront';
import { buildBfcmAudit, FRESH_DAYS, liveFromProbe, type AuditInput, type BfcmAudit, type LiveCheck } from './bfcm.ts';
import { isDemo } from './demo.ts';
import type { supabaseServer } from './supabase.ts';

type Client = Awaited<ReturnType<typeof supabaseServer>>;
export type AuditStore = { id: string; name: string; public_url: string; checkout_consent_at: string | null };

const DAY = 864e5;
const LIVE = { skipProducts: true, skipCart: true, featuredProducts: 3, gapMs: 300, timeoutMs: 10_000 } as const;

/** One light visit to the storefront. null when the visit itself failed to run. */
export async function liveCheck(url: string): Promise<LiveCheck | null> {
  if (isDemo()) return demoLive(url);
  try {
    return liveFromProbe(await probeStore(url, LIVE));
  } catch {
    return null;
  }
}

export async function runStoreAudit(supabase: Client, store: AuditStore, now = Date.now()): Promise<BfcmAudit> {
  const since = (days: number) => new Date(now - days * DAY).toISOString();
  const [speed, site, runs, incidents, uptime, changes] = await Promise.all([
    supabase.from('speed_samples').select('sampled_at, performance_score, lcp_ms, field_category, field_lcp_ms').eq('store_id', store.id).eq('page', 'home').order('sampled_at', { ascending: false }).limit(1),
    supabase.from('site_checks').select('checked_at, ssl_expires_at, ssl_error, domain, domain_expires_at, domain_error, pages_checked, broken').eq('store_id', store.id).order('checked_at', { ascending: false }).limit(1),
    supabase.from('checkout_runs').select('ran_at, result, device, failed_step').eq('store_id', store.id).gte('ran_at', since(2)).order('ran_at', { ascending: false }).limit(20),
    supabase.from('incidents').select('kind, opened_at, cause').eq('store_id', store.id).is('resolved_at', null),
    supabase.rpc('uptime_stats', { p_store: store.id, p_from: since(30), p_to: new Date(now).toISOString() }),
    supabase.from('changes').select('kind, occurred_at, summary').eq('store_id', store.id).gte('occurred_at', since(14)).in('kind', ['theme_published', 'app_added']).order('occurred_at', { ascending: false }).limit(30),
  ]);
  if ([speed, site, runs, incidents, uptime, changes].some((r) => r.error)) throw new Error('Monitoring data could not be loaded.');

  const s = site.data?.[0] as { checked_at: string; ssl_expires_at: string | null; ssl_error: string | null; domain: string | null; domain_expires_at: string | null; domain_error: string | null; pages_checked: number; broken: { url: string; status: number }[] | null } | undefined;
  const siteFresh = !!s && now - Date.parse(s.checked_at) <= FRESH_DAYS * DAY;
  const host = new URL(store.public_url).hostname;
  const at = new Date(now).toISOString();
  const [live, cert, domain] = await Promise.all([
    liveCheck(store.public_url),
    siteFresh || isDemo() ? null : checkCertificate(host).catch((e: Error) => ({ error: e.message })),
    siteFresh || isDemo() ? null : domainExpiry(host).catch((e: Error) => ({ domain: host, error: e.message })),
  ]);

  const sp = speed.data?.[0] as { sampled_at: string; performance_score: number | null; lcp_ms: number | null; field_category: string | null; field_lcp_ms: number | null } | undefined;
  const up = (uptime.data as { checks: number | string; ok: number | string }[] | null)?.[0];
  const input: AuditInput = {
    kind: 'store',
    storeName: store.name,
    url: store.public_url,
    now,
    live,
    checkout: { consent: !!store.checkout_consent_at, runs: (runs.data ?? []) as NonNullable<AuditInput['checkout']>['runs'] },
    incidents: (incidents.data ?? []) as NonNullable<AuditInput['incidents']>,
    uptime: up ? { checks: Number(up.checks), ok: Number(up.ok) } : null,
    changes: (changes.data ?? []) as NonNullable<AuditInput['changes']>,
    speed: sp ? { at: sp.sampled_at, performance: sp.performance_score, lcpMs: sp.lcp_ms, field: sp.field_category, fieldLcpMs: sp.field_lcp_ms } : null,
    ssl: siteFresh ? { at: s!.checked_at, expiresAt: s!.ssl_expires_at, error: s!.ssl_error } : cert ? ('error' in cert ? { at, expiresAt: null, error: cert.error } : { at, expiresAt: cert.expiresAt, error: null }) : null,
    domain: siteFresh
      ? { at: s!.checked_at, name: s!.domain, expiresAt: s!.domain_expires_at, error: s!.domain_error }
      : domain ? { at, name: domain.domain, expiresAt: 'expiresAt' in domain ? domain.expiresAt : null, error: 'error' in domain ? domain.error : null } : null,
    links: siteFresh && s!.pages_checked ? { at: s!.checked_at, checked: s!.pages_checked, broken: s!.broken ?? [] } : null,
  };
  return buildBfcmAudit(input);
}

// --------------------------------------------------------------------------------------------- Demo answers

const product = (handle: string, title: string, state: 'available' | 'sold_out' | 'missing' = 'available') => ({ handle, title: state === 'missing' ? null : title, state, status: state === 'missing' ? 404 : 200 });
const apps = (names: string[], unknown: string[] = []) => [...names.map((name) => ({ name, known: true })), ...unknown.map((name) => ({ name, known: false }))];
const open = (products: string[], noindex: 'meta' | null = null) => ({ pageType: 'index', password: false, unavailable: false, noindex, googleBlocked: false, products });

/** The sample stores, as a live visit would find them: one sold-out hero, one noindex left behind, one firewall. */
const DEMO_LIVE: Record<string, LiveCheck> = {
  'juniperandash.com': { status: 200, ms: 610, blocked: false, page: open(['hearthwood-candle-300g', 'fig-cedar-diffuser', 'linen-room-spray']),
    apps: apps(['Klaviyo', 'Judge.me', 'Smile.io', 'Gorgias', 'Recharge', 'Meta Pixel', 'Google Tag Manager', 'Loop Returns', 'Rebuy', 'Afterpay'], ['Pushowl', 'cdn.upsell-widget.io']),
    featured: [product('hearthwood-candle-300g', 'Hearthwood Candle 300g', 'sold_out'), product('fig-cedar-diffuser', 'Fig & Cedar Diffuser'), product('linen-room-spray', 'Linen Room Spray')] },
  'ferrocoffee.co': { status: 200, ms: 820, blocked: false, page: open(['house-espresso-1kg', 'decaf-colombia', 'v60-starter-kit']),
    apps: apps(['Klaviyo', 'Okendo', 'Meta Pixel', 'Google Tag Manager', 'Recharge'], ['cdn.paywidget-pro.io']),
    featured: [product('house-espresso-1kg', 'House Espresso 1kg'), product('decaf-colombia', 'Decaf Colombia'), product('v60-starter-kit', 'V60 Starter Kit')] },
  'bloombotanics.com': { status: 200, ms: 1340, blocked: false, page: open(['winter-rose-serum', 'night-balm', 'gift-set-trio']),
    apps: apps(['Klaviyo', 'Okendo', 'Meta Pixel', 'Google Tag Manager', 'TikTok Pixel', 'Attentive']),
    featured: [product('winter-rose-serum', 'Winter Rose Serum'), product('night-balm', 'Night Balm'), product('gift-set-trio', 'Gift Set Trio')] },
  'kiteandkin.com': { status: 200, ms: 540, blocked: false, page: open(['holiday-kite-red', 'storm-kite', 'kite-repair-kit']),
    apps: apps(['Klaviyo', 'Okendo', 'Meta Pixel', 'Google Tag Manager', 'TikTok Pixel', 'Attentive']),
    featured: [product('holiday-kite-red', 'Holiday Kite – Red'), product('storm-kite', 'Storm Kite'), product('kite-repair-kit', 'Kite Repair Kit')] },
  'saltgrassswim.com': { status: 200, ms: 700, blocked: false, page: open(['coastline-one-piece', 'reef-bikini-set', 'linen-cover-up'], 'meta'),
    apps: apps(['Klaviyo', 'Okendo', 'Meta Pixel', 'Google Tag Manager', 'TikTok Pixel']),
    featured: [product('coastline-one-piece', 'Coastline One-Piece'), product('reef-bikini-set', 'Reef Bikini Set'), product('linen-cover-up', 'Linen Cover-Up')] },
  'ostraceramics.eu': { status: 429, ms: 300, blocked: true, page: null, apps: [], featured: [] },
};

async function demoLive(url: string): Promise<LiveCheck | null> {
  const host = new URL(url).hostname.replace(/^www\./, '');
  // A real visit takes a second or two: keep the progress states visible in demos.
  await new Promise((r) => setTimeout(r, 700 + (host.length % 6) * 160));
  const hit = DEMO_LIVE[host];
  return hit ? structuredClone(hit) : { status: 200, ms: 700, blocked: false, page: open([]), apps: [], featured: [] };
}

'use server';

import { redirect } from 'next/navigation';
import { normalizeStoreUrl, probeStore } from '@storecare/storefront';
import { supabaseServer } from '@/lib/supabase';

export async function createWorkspace(formData: FormData) {
  const name = String(formData.get('agency') ?? '').trim();
  if (!name) redirect('/onboarding?error=name');
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('create_agency', { agency_name: name, band: String(formData.get('band') ?? '') || null });
  if (error) redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
  redirect('/onboarding/trial');
}

export type StoreCheck =
  | { ok: true; url: string; name: string; theme: string | null; productsVisible: boolean; productCount: number | null; apps: number; limited: string | null; handle: string | null }
  | { ok: false; url: string; message: string };

/** Onboarding step 2: a quick look at the storefront before the agency adds it. */
export async function checkStore(_prev: StoreCheck | null, formData: FormData): Promise<StoreCheck> {
  const raw = String(formData.get('url') ?? '');
  let url: string;
  try {
    url = normalizeStoreUrl(raw);
  } catch {
    return { ok: false, url: raw, message: 'That does not look like a web address.' };
  }
  const r = await probeStore(url, { maxProductPages: 1, gapMs: 300 });
  if (r.home.error && !r.home.status) return { ok: false, url, message: `We could not reach ${url} (${r.home.error}).` };
  if (!r.home.blocked && !r.isShopify) return { ok: false, url, message: 'This does not look like a Shopify store.' };

  const feed = r.productFeed.status === 'ok' ? r.productFeed : null;
  const finalUrl = r.finalUrl ? new URL(r.finalUrl).origin : url;
  return {
    ok: true,
    url: finalUrl,
    // The agency can rename it; the host is a sensible default.
    name: new URL(finalUrl).host.replace(/^www\./, ''),
    theme: r.theme ? `${r.theme.name ?? 'Untitled'}${r.theme.schemaName ? ` (${r.theme.schemaName} ${r.theme.schemaVersion ?? ''})` : ''}`.trim() : null,
    productsVisible: !!feed,
    productCount: feed ? feed.products.length : null,
    apps: r.apps.length,
    limited: r.home.blocked ? 'blocked' : r.isShopify && !r.theme ? 'headless' : !feed ? 'no_product_feed' : null,
    handle: feed?.products[0]?.handle ?? null,
  };
}

export async function addStore(formData: FormData) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: agencies } = await supabase.from('agencies').select('id').order('created_at').limit(1);
  const agencyId = agencies?.[0]?.id;
  if (!agencyId) redirect('/onboarding');

  const url = normalizeStoreUrl(String(formData.get('url')));
  const consent = formData.get('consent') === 'on';
  const { data: store, error } = await supabase
    .from('stores')
    .insert({
      agency_id: agencyId,
      name: String(formData.get('name') || new URL(url).host),
      public_url: url,
      client_contact_name: String(formData.get('contact_name') ?? '') || null,
      client_contact_email: String(formData.get('contact_email') ?? '') || null,
      checkout_consent_at: consent ? new Date().toISOString() : null,
      checkout_product_handle: String(formData.get('handle') ?? '') || null,
      timezone: String(formData.get('tz') ?? '') || 'UTC',
    })
    .select('id')
    .single();
  // Store limit or ended trial (database trigger): explain on the billing page, where the fix is.
  if (error?.hint === 'billing') redirect(`/billing?error=${encodeURIComponent(error.message)}`);
  if (error) redirect(`/onboarding/store?error=${encodeURIComponent(error.message)}`);

  await supabase.from('care_plans').insert({ store_id: store.id, agency_id: agencyId });
  if (user.email) {
    const { count } = await supabase.from('alert_routes').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId);
    if (!count) await supabase.from('alert_routes').insert({ agency_id: agencyId, channel: 'email', target: user.email, min_severity: 'incident' });
  }
  redirect(`/onboarding/plan?store=${store.id}`);
}

export async function savePlan(formData: FormData) {
  const supabase = await supabaseServer();
  const storeId = String(formData.get('store'));
  const { data: store } = await supabase.from('stores').select('id, agency_id').eq('id', storeId).single();
  if (!store) redirect('/');

  await supabase
    .from('care_plans')
    .update({
      name: String(formData.get('plan') || 'Care plan'),
      hours_included: Number(formData.get('hours') || 0),
      rollover_rule: formData.get('rollover') === 'expire' ? 'expire' : 'one_month',
    })
    .eq('store_id', storeId);
  await supabase
    .from('stores')
    .update({ checkout_mobile: formData.get('mobile') === 'on', checkout_desktop: formData.get('desktop') === 'on' })
    .eq('id', storeId);

  const slack = String(formData.get('slack') ?? '').trim();
  if (slack.startsWith('https://hooks.slack.com/')) {
    await supabase.from('alert_routes').insert({ agency_id: store.agency_id, store_id: storeId, channel: 'slack', target: slack, min_severity: 'risky' });
  }
  redirect(`/stores/${storeId}?welcome=1`);
}

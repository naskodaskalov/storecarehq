'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { normalizeStoreUrl } from '@storecare/storefront';
import { supabaseServer } from '@/lib/supabase';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const back = (id: string, q: string) => redirect(`/stores/${id}/settings?${q}`);

export async function retryAlert(formData: FormData) {
  const id = str(formData, 'store');
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('retry_alert_delivery', { delivery_id: str(formData, 'delivery') });
  if (error) back(id, 'error=' + encodeURIComponent('Could not retry this alert. Check that its destination is still configured.'));
  revalidatePath(`/stores/${id}/settings`);
  back(id, 'saved=alert');
}

export async function saveStore(formData: FormData) {
  const id = str(formData, 'store');
  const supabase = await supabaseServer();
  const { data: store } = await supabase.from('stores').select('id, agency_id, public_url, checkout_consent_at').eq('id', id).single();
  if (!store) redirect('/');

  const name = str(formData, 'name');
  if (!name) back(id, 'error=' + encodeURIComponent('Give the store a name.'));

  let url: string;
  try {
    url = normalizeStoreUrl(str(formData, 'url'));
  } catch (e) {
    back(id, 'error=' + encodeURIComponent(e instanceof Error ? e.message : 'Invalid store address.'));
    return;
  }
  const urlChanged = url !== store.public_url;

  const hours = Number(str(formData, 'hours') || 0);
  if (!Number.isFinite(hours) || hours < 0 || hours > 999) back(id, 'error=' + encodeURIComponent('Hours must be between 0 and 999.'));

  const email = str(formData, 'contact_email');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back(id, 'error=' + encodeURIComponent('That client email does not look right.'));
  const slack = str(formData, 'slack');
  if (slack && !/^https:\/\/hooks\.slack\.com\/services\/[^\s?#]+$/.test(slack)) {
    back(id, 'error=' + encodeURIComponent('Enter a Slack incoming-webhook URL starting with https://hooks.slack.com/services/'));
  }

  const consent = formData.get('consent') === 'on';
  if (consent && formData.get('mobile') !== 'on' && formData.get('desktop') !== 'on') {
    back(id, 'error=' + encodeURIComponent('Select at least one device for the checkout test.'));
  }
  const handle = str(formData, 'handle').replace(/^\/?products\//, '').replace(/[?#].*$/, '');

  const { error } = await supabase
    .from('stores')
    .update({
      name,
      public_url: url,
      timezone: str(formData, 'timezone') || 'UTC',
      client_contact_name: str(formData, 'contact_name') || null,
      client_contact_email: email || null,
      // Keep the original consent date when it stays on; record now when it is turned on.
      checkout_consent_at: consent ? (store.checkout_consent_at ?? new Date().toISOString()) : null,
      checkout_product_handle: handle || null,
      checkout_mobile: formData.get('mobile') === 'on',
      checkout_desktop: formData.get('desktop') === 'on',
      // A new address starts monitoring fresh: the stores_url_change trigger clears old snapshots and status.
    })
    .eq('id', id);
  if (error) {
    const msg = error.message.includes('stores_agency_id_public_url_key') ? 'Another store already uses that address.' : error.message;
    back(id, 'error=' + encodeURIComponent(msg));
  }

  await supabase
    .from('care_plans')
    .update({
      name: str(formData, 'plan') || 'Care plan',
      hours_included: hours,
      rollover_rule: formData.get('rollover') === 'expire' ? 'expire' : 'one_month',
    })
    .eq('store_id', id);

  // One Slack webhook per store; an empty field removes it.
  const { data: existing, error: routeReadError } = await supabase.from('alert_routes').select('id,target').eq('store_id', id).eq('channel', 'slack');
  if (routeReadError) back(id, 'error=' + encodeURIComponent('Could not load alert settings. Please try again.'));
  // Preserve unchanged route IDs: queued messages reference them.
  const unchanged = existing?.find(r => r.target === slack);
  const remove = existing?.filter(r => r.id !== unchanged?.id).map(r => r.id) ?? [];
  if (remove.length) {
    const { error: deleteError } = await supabase.from('alert_routes').delete().in('id', remove).eq('store_id', id);
    if (deleteError) back(id, 'error=' + encodeURIComponent('Could not update alert settings. Please try again.'));
  }
  if (slack && !unchanged) {
    const { error: insertError } = await supabase.from('alert_routes').insert({ agency_id: store.agency_id, store_id: id, channel: 'slack', target: slack, min_severity: 'risky' });
    if (insertError) back(id, 'error=' + encodeURIComponent('Could not save the Slack alert destination. Please try again.'));
  }

  revalidatePath(`/stores/${id}`);
  revalidatePath('/');
  back(id, urlChanged ? 'saved=url' : 'saved=1');
}

export async function setPaused(formData: FormData) {
  const id = str(formData, 'store');
  const pause = formData.get('pause') === '1';
  const supabase = await supabaseServer();
  await supabase.from('stores').update({ status: pause ? 'paused' : 'active', limited_reason: null, blocked_streak: 0 }).eq('id', id);
  revalidatePath(`/stores/${id}`);
  revalidatePath('/');
  back(id, pause ? 'saved=paused' : 'saved=resumed');
}

export async function deleteStore(formData: FormData) {
  const id = str(formData, 'store');
  const supabase = await supabaseServer();
  const { data: store } = await supabase.from('stores').select('id, name').eq('id', id).single();
  if (!store) redirect('/');
  if (str(formData, 'confirm') !== store.name) {
    back(id, 'error=' + encodeURIComponent(`Type the store name, ${store.name}, to delete it.`));
  }
  const { error } = await supabase.from('stores').delete().eq('id', id);
  if (error) back(id, 'error=' + encodeURIComponent(error.message));
  revalidatePath('/');
  redirect('/?deleted=' + encodeURIComponent(store.name));
}

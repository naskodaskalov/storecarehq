// One store's audit for the signed-in user: the BFCM board calls POST /api/bfcm/<store> once per store, a few at a
// time. A route handler rather than a server action, because Next.js runs a page's server actions one after another.

import { billingState } from './billing.ts';
import { AGENCY_COLUMNS, type Agency } from './data.ts';
import { runStoreAudit } from './bfcm-data.ts';
import type { BfcmAudit } from './bfcm.ts';
import { supabaseServer } from './supabase.ts';

export type AuditRun =
  | { ok: true; id: string; verdict: BfcmAudit['verdict']; fixes: number; looks: number; checkedAt: string }
  | { ok: false; error: string };

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A store checked this recently returns that audit: a double click or a second tab doesn't visit the store again. */
export const REUSE_MS = 2 * 60_000;

export async function runAudit(storeId: string): Promise<{ status: number; body: AuditRun }> {
  const fail = (status: number, error: string) => ({ status, body: { ok: false as const, error } });
  if (!UUID.test(storeId)) return fail(404, 'Store not found.');
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail(401, 'Sign in to continue.');
  const { data: agencies } = await supabase.from('agencies').select(AGENCY_COLUMNS).order('created_at').limit(1);
  const agency = agencies?.[0] as Agency | undefined;
  if (!agency) return fail(403, 'Create your workspace first.');
  if (!billingState(agency).hasAccess) return fail(402, 'Choose a plan to run the audit.');

  const { data: store, error } = await supabase.from('stores').select('id, agency_id, name, public_url, status, checkout_consent_at').eq('id', storeId).maybeSingle();
  if (error) return fail(503, 'The store could not be loaded. Try again.');
  if (!store || store.agency_id !== agency.id) return fail(404, 'Store not found.');
  if (store.status === 'paused') return fail(409, 'Monitoring is paused for this store.');

  const { data: recent } = await supabase.from('store_audits').select('id, verdict, fixes, looks, created_at')
    .eq('store_id', storeId).gte('created_at', new Date(Date.now() - REUSE_MS).toISOString()).order('created_at', { ascending: false }).limit(1);
  const last = recent?.[0];
  if (last) return { status: 200, body: { ok: true, id: last.id, verdict: last.verdict, fixes: last.fixes, looks: last.looks, checkedAt: last.created_at } };

  let audit: BfcmAudit;
  try {
    audit = await runStoreAudit(supabase, store);
  } catch {
    return fail(503, 'Some monitoring data could not be loaded. Try again.');
  }
  const { data: row, error: insertError } = await supabase.from('store_audits')
    .insert({ store_id: store.id, agency_id: store.agency_id, created_by: user.id, audit, verdict: audit.verdict, fixes: audit.fixes, looks: audit.looks })
    .select('id').single();
  if (insertError || !row) return fail(503, 'The audit ran but could not be saved. Try again.');
  return { status: 200, body: { ok: true, id: row.id, verdict: audit.verdict, fixes: audit.fixes, looks: audit.looks, checkedAt: audit.checkedAt } };
}

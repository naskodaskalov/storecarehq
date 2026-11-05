'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import { validAudit, type BfcmAudit } from '@/lib/bfcm';
import { replyToFor } from '@/lib/agency-reply-to';
import { auditEmailHtml, auditEmailKey, auditEmailSubject, auditEmailText } from '@/lib/bfcm-email';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const back = (id: string, query: string) => redirect(`/bfcm/${id}?${query}`);

async function loadAudit(id: string) {
  if (!UUID.test(id)) redirect('/bfcm');
  const supabase = await supabaseServer();
  const { data } = await supabase.from('store_audits').select('id, store_id, agency_id, audit, note, share_token, shared_at').eq('id', id).maybeSingle();
  if (!data) redirect('/bfcm');
  return { supabase, row: data };
}

/** Turns the client link on or off. Off: the link stops working until it is turned on again. */
export async function shareAudit(formData: FormData) {
  const id = str(formData, 'audit');
  const on = str(formData, 'share') === 'on';
  const { supabase } = await loadAudit(id);
  const { error } = await supabase.from('store_audits').update({ shared_at: on ? new Date().toISOString() : null }).eq('id', id);
  if (error) back(id, `error=${encodeURIComponent('The client link could not be changed. Try again.')}`);
  revalidatePath(`/bfcm/${id}`);
  back(id, on ? 'shared=1' : 'unshared=1');
}

export async function saveAuditNote(formData: FormData) {
  const id = str(formData, 'audit');
  const note = str(formData, 'note').replace(/\r\n/g, '\n');
  if (note.length > 1000) back(id, `error=${encodeURIComponent('Keep the note under 1,000 characters.')}`);
  const { supabase } = await loadAudit(id);
  const { error } = await supabase.from('store_audits').update({ note: note || null }).eq('id', id);
  if (error) back(id, `error=${encodeURIComponent('The note could not be saved. Try again.')}`);
  revalidatePath(`/bfcm/${id}`);
  back(id, 'saved=1');
}

/** Emails the client the one-pager's link (sharing it), or records a manual send after the mailto. */
export async function sendAudit(formData: FormData) {
  const id = str(formData, 'audit');
  const to = str(formData, 'to');
  const manual = formData.get('manual') === '1';
  const { supabase, row } = await loadAudit(id);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to.length > 320) back(id, `error=${encodeURIComponent('Enter the client’s email address.')}`);
  if (!validAudit(row.audit)) back(id, `error=${encodeURIComponent('This audit can’t be sent. Run the store again.')}`);
  const audit = row.audit as BfcmAudit;
  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/r/audit/${row.share_token}`;

  if (!manual) {
    const key = process.env.RESEND_API_KEY;
    if (!key) back(id, `error=${encodeURIComponent('Email sending is not set up yet. Use “Open in my email app” instead.')}`);
    const [{ data: agency }, { data: store }] = await Promise.all([
      supabase.from('agencies').select('name, brand_color, sender_email').eq('id', row.agency_id).single(),
      supabase.from('stores').select('client_contact_name').eq('id', row.store_id).maybeSingle(),
    ]);
    if (!agency) back(id, `error=${encodeURIComponent('Your agency could not be loaded. Try again.')}`);
    const replyTo = await replyToFor(row.agency_id, agency!.sender_email);
    const email = { agencyName: agency!.name, brandColor: agency!.brand_color, audit, note: row.note, link, replyTo, contactName: store?.client_contact_name ?? null };
    let res: Response | null = null;
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(15_000),
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'idempotency-key': auditEmailKey(id, row.note, to) },
        body: JSON.stringify({
          from: process.env.REPORTS_FROM ?? `${agency!.name} <reports@storecarehq.com>`,
          to: [to],
          ...(replyTo ? { reply_to: replyTo } : {}),
          subject: auditEmailSubject(audit),
          text: auditEmailText(email),
          html: auditEmailHtml(email),
        }),
      });
    } catch {
      back(id, `error=${encodeURIComponent('The email request timed out. Sending again is safe: the same check is never emailed twice to one address within a day.')}`);
    }
    if (res!.status === 409) back(id, `error=${encodeURIComponent('This check is already being sent to that address. Wait a minute and reload.')}`);
    if (!res!.ok) back(id, `error=${encodeURIComponent(`The email could not be sent (HTTP ${res!.status}). Check the email settings and try again.`)}`);
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from('store_audits').update({ shared_at: row.shared_at ?? now, sent_at: now, sent_to: to }).eq('id', id);
  if (error) back(id, `error=${encodeURIComponent(manual ? 'Could not record the send. Try again.' : 'The email was sent, but its status could not be saved. Sending again is safe.')}`);
  // Remember the client's address for next time when the store has none yet. Best effort.
  await supabase.from('stores').update({ client_contact_email: to }).eq('id', row.store_id).is('client_contact_email', null);
  revalidatePath(`/bfcm/${id}`);
  revalidatePath('/bfcm');
  back(id, 'sent=1');
}

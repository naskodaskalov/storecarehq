'use server';

import { revalidatePath } from 'next/cache';
import { parseRequest, PORTAL_TOKEN, requestErrorMessage } from '@/lib/client-portal';
import { supabaseServer } from '@/lib/supabase';

export type RequestValues = { name?: string; email?: string; subject?: string; body?: string; urgency?: string };
export type RequestState = { ok: boolean; message: string | null; values?: RequestValues };

const values = (form: FormData, keepAll: boolean): RequestValues => {
  const v = (k: string) => String(form.get(k) ?? '').slice(0, 5000);
  return keepAll ? { name: v('name'), email: v('email'), subject: v('subject'), body: v('body'), urgency: v('urgency') } : { name: v('name'), email: v('email') };
};

/** A client sends a request from their portal. No account: the token is the key, and the database
 *  re-checks every rule (submit_portal_request), including a per-store rate limit. */
export async function sendRequest(token: string, _prev: RequestState, form: FormData): Promise<RequestState> {
  if (!PORTAL_TOKEN.test(token)) return { ok: false, message: requestErrorMessage('portal_not_found'), values: values(form, true) };
  // Bots fill every field; people never see this one.
  if (String(form.get('website') ?? '').trim()) return { ok: true, message: 'Thanks. Your request was sent.' };
  const parsed = parseRequest(form);
  if (!parsed.ok) return { ok: false, message: parsed.error, values: values(form, true) };
  const { name, email, subject, body, urgency } = parsed.value;
  const supabase = await supabaseServer();
  const { error } = await supabase.rpc('submit_portal_request', { token, p_name: name, p_email: email, p_subject: subject, p_body: body, p_urgency: urgency });
  if (error) return { ok: false, message: requestErrorMessage(error.message), values: values(form, true) };
  revalidatePath(`/p/${token}`);
  return {
    ok: true,
    message: urgency === 'urgent' ? 'Sent and flagged as urgent. Your agency has been alerted.' : 'Thanks. Your request was sent, and you will see its progress here.',
    values: values(form, false),
  };
}

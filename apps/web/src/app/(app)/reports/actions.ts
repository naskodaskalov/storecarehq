'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { buildFacts, DEFAULT_SECTIONS, monthPeriod, writeSummary, type Facts, type Sections } from '@storecare/reports';
import { supabaseServer } from '@/lib/supabase';
import { loadMonthData } from '@/lib/report-data';
import { replyToFor } from '@/lib/agency-reply-to';
import { reportEmailHtml, reportEmailKey, reportEmailSubject, reportEmailText } from '@/lib/report-email';
import { persistReportEdit } from '@/lib/report-workflow';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const SECTION_KEYS = Object.keys(DEFAULT_SECTIONS) as (keyof Sections)[];

async function draftFor(storeId: string, periodStart: string) {
  const supabase = await supabaseServer();
  let period;
  try { period = monthPeriod(periodStart); } catch { return { supabase, error: 'Choose a valid reporting month.' }; }
  let data;
  try { data = await loadMonthData(supabase, storeId, period); }
  catch { return { supabase, error: 'Some report data could not be loaded. Please try again; no draft has been changed.' }; }
  if (!data) return { supabase, error: 'Store not found.' as const };
  const facts = buildFacts(data);
  const summary = await writeSummary(facts, { apiKey: process.env.ANTHROPIC_API_KEY });
  if (summary.error) console.warn(`[reports] AI summary failed, used template: ${summary.error}`);
  return { supabase, facts, summary, period };
}

/** Creates the report for a store and month, or rebuilds an existing draft from fresh data. */
export async function draftReport(formData: FormData) {
  const storeId = str(formData, 'store');
  const periodStart = str(formData, 'period');
  const r = await draftFor(storeId, periodStart);
  if ('error' in r) redirect(`/reports?error=${encodeURIComponent(r.error ?? 'Could not draft the report.')}`);
  const { supabase, facts, summary, period } = r;

  const { data: store, error: storeError } = await supabase.from('stores').select('agency_id').eq('id', storeId).single();
  if (storeError || !store) redirect('/reports?error=' + encodeURIComponent('The store could not be loaded. Please try again.'));
  const { data: existing, error: existingError } = await supabase
    .from('reports')
    .select('id, status, updated_at')
    .eq('store_id', storeId)
    .eq('period', period.start)
    .limit(1);
  if (existingError) redirect('/reports?error=' + encodeURIComponent('The report could not be loaded. Please try again.'));
  const row = { facts, summary_text: summary.text, summary_source: summary.source, updated_at: new Date().toISOString() };

  let id = existing?.[0]?.id as string | undefined;
  if (id) {
    if (existing![0].status !== 'draft') redirect(`/reports/${id}?error=${encodeURIComponent('Reopen the report before refreshing it.')}`);
    if (str(formData, 'version') !== existing![0].updated_at) redirect(`/reports/${id}?error=${encodeURIComponent('This draft changed since you opened it. Reload it before refreshing its data.')}`);
    const { data: updated, error } = await supabase.from('reports').update(row).eq('id', id)
      .eq('status', 'draft').eq('updated_at', existing![0].updated_at).select('id').single();
    if (error || !updated) redirect(`/reports/${id}?error=${encodeURIComponent('Could not refresh this draft. Reload it and try again; it may have changed in another tab.')}`);
  } else {
    const { data: created, error } = await supabase
      .from('reports')
      .insert({ store_id: storeId, agency_id: store!.agency_id, period: period.start, status: 'draft', sections: DEFAULT_SECTIONS, ...row })
      .select('id')
      .single();
    if (error || !created) redirect(`/reports?error=${encodeURIComponent(error?.message ?? 'Could not create the report.')}`);
    id = created.id;
  }
  revalidatePath('/reports');
  redirect(`/reports/${id}?drafted=${summary.source}`);
}

export async function saveReport(formData: FormData) {
  const id = str(formData, 'report');
  const supabase = await supabaseServer();
  const { data: report } = await supabase.from('reports').select('id, status, updated_at, summary_text, summary_source').eq('id', id).single();
  if (!report) redirect('/reports');
  if (report.status !== 'draft') redirect(`/reports/${id}?error=${encodeURIComponent('Reopen the report to edit it.')}`);

  const summary = str(formData, 'summary');
  const sections = Object.fromEntries(SECTION_KEYS.map((k) => [k, formData.get(`section_${k}`) === 'on'])) as Sections;
  const approving = formData.get('intent') === 'approve';
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const problem = await persistReportEdit(supabase, report, { summary, sections, version: str(formData, 'version'), approver: approving ? user.id : undefined });
  if (problem) redirect(`/reports/${id}?error=${encodeURIComponent(problem)}`);

  revalidatePath(`/reports/${id}`);
  if (approving) {
    revalidatePath('/reports');
    redirect(`/reports/${id}?approved=1`);
  }
  redirect(`/reports/${id}?saved=1`);
}

export async function reopenReport(formData: FormData) {
  const id = str(formData, 'report');
  const supabase = await supabaseServer();
  const { data, error } = await supabase.from('reports').update({ status: 'draft', approved_by: null, updated_at: new Date().toISOString() })
    .eq('id', id).eq('updated_at', str(formData, 'version')).select('id').single();
  if (error || !data) redirect(`/reports/${id}?error=${encodeURIComponent('Could not reopen this report. Reload it and try again.')}`);
  revalidatePath(`/reports/${id}`);
  revalidatePath('/reports');
  redirect(`/reports/${id}`);
}

/** Emails the client a link when Resend is configured; otherwise just records it as sent (after a mailto). */
export async function sendReport(formData: FormData) {
  const id = str(formData, 'report');
  const to = str(formData, 'to');
  const supabase = await supabaseServer();
  const { data: report } = await supabase.from('reports').select('id, store_id, agency_id, status, share_token, summary_text, facts, updated_at').eq('id', id).single();
  if (!report) redirect('/reports');
  if (report.status === 'draft') redirect(`/reports/${id}?error=${encodeURIComponent('Approve the report before sending it.')}`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) redirect(`/reports/${id}?error=${encodeURIComponent('Enter the client email address.')}`);

  const facts = report.facts as Facts;
  const link = `${process.env.NEXT_PUBLIC_APP_URL}/r/${report.share_token}`;
  const manual = formData.get('manual') === '1';

  if (!manual) {
    const key = process.env.RESEND_API_KEY;
    if (!key) redirect(`/reports/${id}?error=${encodeURIComponent('Email sending is not set up yet. Use "Open in my email app" instead.')}`);
    const from = process.env.REPORTS_FROM ?? `${facts.agencyName} <reports@storecarehq.com>`;
    const { data: agency } = await supabase.from('agencies').select('sender_email').eq('id', report.agency_id).single();
    const replyTo = await replyToFor(report.agency_id, agency?.sender_email);
    const email = { agencyName: facts.agencyName, brandColor: facts.brandColor, storeName: facts.storeName,
      periodLabel: facts.period.label, summary: report.summary_text ?? '', link, replyTo };
    let res: Response;
    try { res = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15_000),
      // The same report version to the same address is one email: a retry after a timeout returns Resend's
      // original result instead of sending again (keys are kept for 24 hours).
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'idempotency-key': reportEmailKey(id, report.updated_at, to) },
      body: JSON.stringify({
        from,
        to: [to],
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject: reportEmailSubject(email),
        text: reportEmailText(email),
        html: reportEmailHtml(email),
      }),
    }); } catch {
      redirect(`/reports/${id}?error=${encodeURIComponent('The email request timed out or could not be completed. You can safely try again: the same report is never emailed twice to the same address within a day.')}`);
    }
    if (res.status === 409) {
      redirect(`/reports/${id}?error=${encodeURIComponent('This report is already being sent to that address. Wait a minute and reload; it will not be sent twice.')}`);
    }
    if (!res.ok) {
      redirect(`/reports/${id}?error=${encodeURIComponent(`Email could not be sent (HTTP ${res.status}). Check your email sending configuration and try again.`)}`);
    }
  }

  const { data: marked, error: markError } = await supabase.from('reports').update({ status: 'sent', sent_at: new Date().toISOString(), sent_to: to })
    .eq('id', id).in('status', ['approved', 'sent']).select('id').single();
  if (markError || !marked) redirect(`/reports/${id}?error=${encodeURIComponent(manual
    ? 'Could not record this report as sent. Reload the report and try again.'
    : 'The email was sent, but its status could not be saved. Sending again is safe: it will not be delivered twice.')}`);
  // Remember the address for next month when the store has no client email yet. Best effort.
  await supabase.from('stores').update({ client_contact_email: to }).eq('id', report.store_id).is('client_contact_email', null);
  revalidatePath(`/reports/${id}`);
  revalidatePath('/reports');
  redirect(`/reports/${id}?sent=1`);
}

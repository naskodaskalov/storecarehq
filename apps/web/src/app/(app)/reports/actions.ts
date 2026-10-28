'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { buildFacts, DEFAULT_SECTIONS, monthPeriod, writeSummary, type Facts, type Sections } from '@storecare/reports';
import { supabaseServer } from '@/lib/supabase';
import { loadMonthData } from '@/lib/report-data';

const str = (f: FormData, k: string) => String(f.get(k) ?? '').trim();
const SECTION_KEYS = Object.keys(DEFAULT_SECTIONS) as (keyof Sections)[];

async function draftFor(storeId: string, periodStart: string) {
  const supabase = await supabaseServer();
  const period = monthPeriod(periodStart);
  const data = await loadMonthData(supabase, storeId, period);
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

  const { data: store } = await supabase.from('stores').select('agency_id').eq('id', storeId).single();
  const { data: existing } = await supabase
    .from('reports')
    .select('id, status')
    .eq('store_id', storeId)
    .eq('period', period.start)
    .limit(1);
  const row = { facts, summary_text: summary.text, summary_source: summary.source, updated_at: new Date().toISOString() };

  let id = existing?.[0]?.id as string | undefined;
  if (id) {
    if (existing![0].status !== 'draft') redirect(`/reports/${id}?error=${encodeURIComponent('Reopen the report before refreshing it.')}`);
    await supabase.from('reports').update(row).eq('id', id);
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
  const { data: report } = await supabase.from('reports').select('id, status, summary_text, summary_source').eq('id', id).single();
  if (!report) redirect('/reports');
  if (report.status !== 'draft') redirect(`/reports/${id}?error=${encodeURIComponent('Reopen the report to edit it.')}`);

  const summary = str(formData, 'summary');
  const sections = Object.fromEntries(SECTION_KEYS.map((k) => [k, formData.get(`section_${k}`) === 'on'])) as Sections;
  await supabase
    .from('reports')
    .update({
      summary_text: summary,
      summary_source: summary !== (report.summary_text ?? '').trim() ? 'edited' : report.summary_source,
      sections,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  revalidatePath(`/reports/${id}`);
  if (formData.get('intent') === 'approve') {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('reports').update({ status: 'approved', approved_by: user?.id ?? null }).eq('id', id);
    revalidatePath('/reports');
    redirect(`/reports/${id}?approved=1`);
  }
  redirect(`/reports/${id}?saved=1`);
}

export async function reopenReport(formData: FormData) {
  const id = str(formData, 'report');
  const supabase = await supabaseServer();
  await supabase.from('reports').update({ status: 'draft', approved_by: null }).eq('id', id);
  revalidatePath(`/reports/${id}`);
  revalidatePath('/reports');
  redirect(`/reports/${id}`);
}

/** Emails the client a link when Resend is configured; otherwise just records it as sent (after a mailto). */
export async function sendReport(formData: FormData) {
  const id = str(formData, 'report');
  const to = str(formData, 'to');
  const supabase = await supabaseServer();
  const { data: report } = await supabase.from('reports').select('id, status, share_token, summary_text, facts').eq('id', id).single();
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
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `${facts.storeName}: your ${facts.period.label} care report`,
        text: `${report.summary_text ?? ''}\n\nRead the full report: ${link}\n\n${facts.agencyName}`,
      }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 200);
      redirect(`/reports/${id}?error=${encodeURIComponent(`Email could not be sent (${res.status}). ${detail}`)}`);
    }
  }

  await supabase.from('reports').update({ status: 'sent', sent_at: new Date().toISOString(), sent_to: to }).eq('id', id);
  revalidatePath(`/reports/${id}`);
  revalidatePath('/reports');
  redirect(`/reports/${id}?sent=1`);
}

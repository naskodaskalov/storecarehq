'use server';

import { requireAdmin } from '@/lib/admin-session';
import { approveTestDelivery, deliveryFingerprint, sendApprovedTest, testDeliveryConfig, type TestDeliveryResult } from '@/lib/outreach-delivery';
import type { TestEmailInput } from '@/lib/outreach-email';
import { contactRow, type OutreachContact } from '@/lib/outreach-history';
import { contactStore } from '@/lib/outreach-history-store';
import { leadStore } from '@/lib/outreach-leads-store';
import { validLeadChanges, validLeadId, type LeadOutcome, type OutreachLead } from '@/lib/outreach-leads';
import { validateProspect } from '@/lib/outreach';
import { publishReportLinks, reportStore, requireSavedReports, revokeReportLinks } from '@/lib/outreach-report-links';

export type SendResult = TestDeliveryResult & { contact?: OutreachContact; historyError?: string };

export async function approveOutreachTest(input: TestEmailInput) {
  const { email } = await requireAdmin();
  try { const saved = await requireSavedReports(input, email, await reportStore()); return { ok: true as const, ...approveTestDelivery(saved, testDeliveryConfig(email)) }; }
  catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : 'The email could not be approved.' }; }
}

/** Sends the approved email, then saves it to the outreach history. Rejected emails are not saved; an email whose
 *  acceptance is unconfirmed is saved as unconfirmed, because it may have gone out. */
export async function sendOutreachTest(input: TestEmailInput, token: string): Promise<SendResult> {
  const { email } = await requireAdmin();
  try {
    const saved = await requireSavedReports(input, email, await reportStore());
    const config = testDeliveryConfig(email);
    const result = await sendApprovedTest(saved, token, config);
    if (result.state === 'failed' || config.mode !== 'agency') return result;
    try { return { ...result, contact: await (await contactStore()).record(contactRow(saved, deliveryFingerprint(saved, config), result, email)) }; }
    catch { return { ...result, historyError: 'It could not be saved to the outreach history, so note this agency yourself.' }; }
  }
  catch (e) { return { state: 'failed' as const, error: e instanceof Error ? e.message : 'The email could not be sent.' }; }
}

export async function publishOutreachReports(input: TestEmailInput) {
  const { email } = await requireAdmin();
  try { return { ok: true as const, links: await publishReportLinks(input, email, await reportStore()) }; }
  catch { return { ok: false as const, error: 'Could not save report links. Check the report data, server credentials and report-links migration.' }; }
}

export async function revokeOutreachReports(id: string) {
  const { email } = await requireAdmin();
  try { await revokeReportLinks(id, email, await reportStore()); return { ok: true as const }; }
  catch { return { ok: false as const, error: 'Could not revoke these report links. Try again.' }; }
}

export type AddLeadsResult = { ok: true; outcomes: LeadOutcome[]; added: OutreachLead[] } | { ok: false; error: string };

/** Saves agencies from a CSV, the manual form or a backup to the lead list. Invalid ones, ones already listed and
 *  ones already emailed are skipped and reported, not saved. */
export async function addOutreachLeads(prospects: unknown[], source: 'csv' | 'manual' | 'backup'): Promise<AddLeadsResult> {
  const { email } = await requireAdmin();
  if (!['csv', 'manual', 'backup'].includes(source) || !Array.isArray(prospects) || prospects.length > 100) return { ok: false, error: 'Add at most 100 agencies at a time.' };
  try {
    const leads = prospects.map((p) => validateProspect(p));
    return { ok: true, ...(await (await leadStore()).add(leads, source, email)) };
  } catch (e) { return { ok: false, error: e instanceof Error && /^(Invalid|Agency name|Use public)/.test(e.message) ? e.message : 'The agencies could not be saved.' }; }
}

export async function updateOutreachLead(id: string, changes: unknown) {
  await requireAdmin();
  try {
    if (!validLeadId(id)) throw new Error('Invalid lead.');
    await (await leadStore()).update(id, validLeadChanges(changes));
    return { ok: true as const };
  } catch { return { ok: false as const, error: 'This change could not be saved. Try again.' }; }
}

export async function removeOutreachLead(id: string) {
  await requireAdmin();
  try {
    if (!validLeadId(id)) throw new Error('Invalid lead.');
    await (await leadStore()).remove(id);
    return { ok: true as const };
  } catch { return { ok: false as const, error: 'This agency could not be removed. Try again.' }; }
}

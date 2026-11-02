'use server';

import { requireAdmin } from '@/lib/admin-session';
import { approveTestDelivery, deliveryFingerprint, sendApprovedTest, testDeliveryConfig, type TestDeliveryResult } from '@/lib/outreach-delivery';
import type { TestEmailInput } from '@/lib/outreach-email';
import { contactRow, type OutreachContact } from '@/lib/outreach-history';
import { contactStore } from '@/lib/outreach-history-store';
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

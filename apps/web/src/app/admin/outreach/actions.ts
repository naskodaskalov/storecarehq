'use server';

import { requireAdmin } from '@/lib/admin-session';
import { approveTestDelivery, sendApprovedTest, testDeliveryConfig } from '@/lib/outreach-delivery';
import type { TestEmailInput } from '@/lib/outreach-email';
import { publishReportLinks, reportStore, requireSavedReports, revokeReportLinks } from '@/lib/outreach-report-links';

export async function approveOutreachTest(input: TestEmailInput) {
  const { email } = await requireAdmin();
  try { const saved = await requireSavedReports(input, email, await reportStore()); return { ok: true as const, ...approveTestDelivery(saved, testDeliveryConfig(email)) }; }
  catch (e) { return { ok: false as const, error: e instanceof Error ? e.message : 'The email could not be approved.' }; }
}

export async function sendOutreachTest(input: TestEmailInput, token: string) {
  const { email } = await requireAdmin();
  try { const saved = await requireSavedReports(input, email, await reportStore()); return await sendApprovedTest(saved, token, testDeliveryConfig(email)); }
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

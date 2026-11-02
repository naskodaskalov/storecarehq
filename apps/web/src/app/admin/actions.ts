'use server';

import { requireAdmin } from '@/lib/admin-session';
import { runQuickReport, type QuickReport } from '@/lib/quick-report';

export type QuickReportState = { report: QuickReport; input: string; preparedBy: string } | null;

/** Runs a one-off report on any store for an admin. Nothing is saved to a workspace. */
export async function quickReport(_prev: QuickReportState, form: FormData): Promise<QuickReportState> {
  await requireAdmin();
  const input = String(form.get('url') ?? '').trim().slice(0, 300);
  const preparedBy = String(form.get('preparedBy') ?? '').trim().slice(0, 80);
  if (!input) return { input, preparedBy, report: { ok: false, error: 'Enter a store address, like clientstore.com.' } };
  try {
    return { input, preparedBy, report: await runQuickReport(input, preparedBy) };
  } catch {
    return { input, preparedBy, report: { ok: false, error: 'The check did not finish. Please try again in a moment.' } };
  }
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Sections } from '@storecare/reports';

type Report = { id: string; status: string; updated_at: string; summary_text: string | null; summary_source: string };
type Edit = { summary: string; sections: Sections; version: string; approver?: string };
export const REPORT_CONFLICT = 'This report changed in another tab. Reload it before saving so you do not overwrite newer changes.';

/** Save content and approval in one conditional write. A stale tab must never publish newer edits. */
export async function persistReportEdit(client: Pick<SupabaseClient, 'from'>, report: Report, edit: Edit): Promise<string | null> {
  if (report.status !== 'draft') return 'Reopen the report to edit it.';
  if (!edit.version || edit.version !== report.updated_at) return REPORT_CONFLICT;
  const { data, error } = await client.from('reports').update({
    summary_text: edit.summary,
    summary_source: edit.summary !== (report.summary_text ?? '').trim() ? 'edited' : report.summary_source,
    sections: edit.sections,
    updated_at: new Date(Math.max(Date.now(), Date.parse(report.updated_at) + 1)).toISOString(),
    ...(edit.approver ? { status: 'approved', approved_by: edit.approver } : {}),
  }).eq('id', report.id).eq('status', 'draft').eq('updated_at', edit.version).select('id').single();
  if (error?.code === 'PGRST116' || (!error && !data)) return REPORT_CONFLICT;
  if (error) return 'The report could not be saved. Please try again. Your changes have not been approved.';
  return null;
}

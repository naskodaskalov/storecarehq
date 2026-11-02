// "Your data" in Settings: export everything an agency has put into StoreCare HQ, and delete the workspace.
// Pure orchestration with the database, Stripe and auth calls passed in, so both paths are tested.

/** What the export contains, table by table. Raw monitoring samples (every uptime check, snapshot and speed
 *  reading) are left out: they are large and already summarised in the reports and change log. */
export const EXPORT_TABLES = {
  stores: 'id, name, public_url, status, limited_reason, health_score, created_at',
  care_plans: 'store_id, name, hours_included, rollover_rule',
  alert_routes: 'id, store_id, channel, target, min_severity',
  work_entries: 'id, store_id, work_date, minutes, title, client_text, counts_to_plan, created_at',
  reports: 'id, store_id, period, status, summary_text, sections, facts, sent_to, sent_at, created_at, updated_at',
  changes: 'id, store_id, occurred_at, kind, summary, risky, work_entry_id',
  incidents: 'id, store_id, kind, opened_at, resolved_at, cause, client_note',
  requests: 'id, store_id, from_email, subject, body, status, received_at',
} as const;
export const EXPORT_AGENCY_COLUMNS = 'name, brand_color, logo_url, sender_email, plan, subscription_status, trial_ends_at, current_period_end, created_at';

type Row = Record<string, unknown>;
/** Reads one page of a table for the agency, ordered stably. */
export type ReadPage = (table: keyof typeof EXPORT_TABLES, columns: string, from: number, to: number) => Promise<Row[]>;

export const PAGE = 1000;

async function readAll(read: ReadPage, table: keyof typeof EXPORT_TABLES): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = await read(table, EXPORT_TABLES[table], from, from + PAGE - 1);
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/** Slack webhook addresses are credentials: the export says one exists without giving it away. */
const maskRoute = (r: Row): Row => (r.channel === 'slack' ? { ...r, target: 'Slack webhook (hidden)' } : r);

export async function buildExport(agency: Row, read: ReadPage, now = new Date()): Promise<Record<string, unknown>> {
  const data: Record<string, Row[]> = {};
  for (const table of Object.keys(EXPORT_TABLES) as (keyof typeof EXPORT_TABLES)[]) {
    const rows = await readAll(read, table);
    data[table] = table === 'alert_routes' ? rows.map(maskRoute) : rows;
  }
  return {
    exported_at: now.toISOString(),
    format: 'StoreCare HQ workspace export, version 1',
    note: 'Raw monitoring samples (each uptime check, snapshot and speed reading) are not included; they are summarised in reports and changes.',
    agency,
    ...data,
  };
}

export function exportFileName(agencyName: string, now = new Date()) {
  const slug = agencyName.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'workspace';
  return `storecare-${slug}-${now.toISOString().slice(0, 10)}.json`;
}

export type DeleteDeps = {
  /** Cancel the Stripe subscription now. Should resolve if it is already gone. */
  cancelSubscription: (id: string) => Promise<void>;
  /** Delete the agency row; everything else cascades. */
  deleteAgency: (id: string) => Promise<void>;
  /** How many other workspaces this user belongs to. */
  otherMemberships: (userId: string) => Promise<number>;
  deleteUser: (userId: string) => Promise<void>;
};

export type DeleteResult = { ok: true; accountDeleted: boolean } | { ok: false; error: string };

export async function deleteWorkspace(
  deps: DeleteDeps,
  input: { agencyId: string; agencyName: string; subscriptionId: string | null; userId: string; isOwner: boolean; confirm: string },
): Promise<DeleteResult> {
  if (!input.isOwner) return { ok: false, error: 'Only the workspace owner can delete the workspace.' };
  if (input.confirm.trim() !== input.agencyName.trim()) return { ok: false, error: 'Type the agency name exactly to confirm.' };
  if (input.subscriptionId) {
    try {
      await deps.cancelSubscription(input.subscriptionId);
    } catch {
      return { ok: false, error: 'We could not cancel your subscription, so nothing was deleted. Please try again or contact us.' };
    }
  }
  try {
    await deps.deleteAgency(input.agencyId);
  } catch {
    return { ok: false, error: 'Your subscription is cancelled, but the workspace could not be deleted. Please try again or contact us.' };
  }
  try {
    if ((await deps.otherMemberships(input.userId)) === 0) {
      await deps.deleteUser(input.userId);
      return { ok: true, accountDeleted: true };
    }
  } catch {
    /* the workspace is gone; the sign-in account can be removed on request */
  }
  return { ok: true, accountDeleted: false };
}

/** Stripe answers "No such subscription" or a cancelled status for subscriptions that are already gone. */
export function alreadyGone(e: unknown): boolean {
  const err = e as { code?: string; raw?: { code?: string }; message?: string };
  const code = err?.code ?? err?.raw?.code;
  return code === 'resource_missing' || /already been canceled|No such subscription/i.test(err?.message ?? '');
}

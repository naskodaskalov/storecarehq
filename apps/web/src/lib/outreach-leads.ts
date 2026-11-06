// Outreach leads: the agency list on /admin/outreach, saved on the server (public.outreach_leads) so it survives the
// browser tab and the daily lead research can add to it directly. Only the list and its review/status are saved;
// health checks and email drafts stay in the tab.
// No server-only imports here: the outreach page uses these helpers in the browser too. Storage: outreach-leads-store.ts.
import { COLUMNS, newPack, validateProspect, type Pack, type Prospect } from './outreach.ts';
import { agencyDomain } from './outreach-history.ts';

export type LeadSource = 'research' | 'csv' | 'manual' | 'backup';
export type LeadStatus = Pack['status'];
export const LEAD_SOURCES: Record<LeadSource, string> = { research: 'Lead research', csv: 'CSV import', manual: 'Added by hand', backup: 'Backup restore' };
export const LEAD_LIMIT = 1000;

/** One saved agency, as the page loads it. Optional text fields are '' rather than null, like a Prospect. */
export type OutreachLead = Prospect & {
  id: string;
  created_at: string;
  source: LeadSource;
  fit_note: string;
  reviewed: boolean;
  status: LeadStatus;
};
export type LeadOutcome = { agency_name: string; agency_domain: string; outcome: string; lead_id: string | null };
export type LeadChanges = Partial<Pick<OutreachLead, 'reviewed' | 'status'>>;

export interface LeadStore {
  /** Newest first. */
  list(limit: number): Promise<OutreachLead[]>;
  /** Adds new agencies; skips (with a reason) invalid ones, ones already listed and ones already emailed. */
  add(leads: (Prospect & { fit_note?: string })[], source: LeadSource, addedBy: string): Promise<{ outcomes: LeadOutcome[]; added: OutreachLead[] }>;
  update(id: string, changes: LeadChanges): Promise<void>;
  remove(id: string): Promise<void>;
}

const STATUSES: LeadStatus[] = ['new', 'prepared', 'contacted', 'replied', 'declined'];
export const validLeadId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

/** Only the review tick and the status can change on a saved lead. */
export function validLeadChanges(input: unknown): LeadChanges {
  if (!input || typeof input !== 'object') throw new Error('Invalid change.');
  const { reviewed, status, ...rest } = input as Record<string, unknown>;
  if (Object.keys(rest).length || (reviewed === undefined && status === undefined)) throw new Error('Invalid change.');
  if (reviewed !== undefined && typeof reviewed !== 'boolean') throw new Error('Invalid review state.');
  if (status !== undefined && !STATUSES.includes(status as LeadStatus)) throw new Error('Invalid status.');
  return { ...(reviewed !== undefined ? { reviewed } : {}), ...(status !== undefined ? { status: status as LeadStatus } : {}) };
}

/** A saved lead as a workspace pack, with nothing prepared yet. */
export function leadPack(lead: OutreachLead): Pack {
  const prospect = Object.fromEntries(COLUMNS.map((k) => [k, lead[k] ?? ''])) as Prospect;
  return { ...newPack(prospect), leadId: lead.id, fitNote: lead.fit_note || undefined, reviewed: lead.reviewed, status: lead.status };
}

const domainOf = (p: Pack) => agencyDomain(p.prospect.agency_url);

/** Puts packs restored from a backup over the saved list: an agency already listed keeps its saved lead and takes the
 *  backup's checks, draft, review and status; the rest are returned to be saved as new leads. */
export function mergeBackup(current: Pack[], restored: Pack[]): { packs: Pack[]; unsaved: Pack[]; changed: Pack[] } {
  const index = new Map(current.map((p, i) => [domainOf(p), i]));
  const packs = [...current], unsaved: Pack[] = [], changed: Pack[] = [];
  for (const r of restored) {
    const i = index.get(domainOf(r));
    if (i === undefined) { unsaved.push(r); continue; }
    const before = packs[i];
    packs[i] = { ...r, prospect: before.prospect, leadId: before.leadId, fitNote: before.fitNote };
    if (before.leadId && (before.reviewed !== r.reviewed || before.status !== r.status)) changed.push(packs[i]);
  }
  return { packs, unsaved, changed };
}

/** "Added 8. Skipped 2: North Studio (already listed), …" */
export function outcomeSummary(outcomes: LeadOutcome[]): string {
  const added = outcomes.filter((o) => o.outcome === 'added').length;
  const skipped = outcomes.filter((o) => o.outcome !== 'added');
  const head = `Added ${added} ${added === 1 ? 'agency' : 'agencies'}.`;
  if (!skipped.length) return head;
  const list = skipped.slice(0, 5).map((o) => `${o.agency_name || 'unnamed'} (${o.outcome.replace(/^invalid: /, '')})`).join(', ');
  return `${head} Skipped ${skipped.length}: ${list}${skipped.length > 5 ? ', …' : ''}.`;
}

/** In-memory store with the same rules as add_outreach_leads, for demo mode and tests. */
export function memoryLeadStore(rows: OutreachLead[] = [], contacted: { agency_domain: string; contact_email: string }[] = [], now = () => new Date().toISOString()): LeadStore {
  return {
    async list(limit) { return [...rows].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, limit); },
    async add(leads, source, _addedBy) {
      if (leads.length > 100) throw new Error('Add at most 100 agencies at a time.');
      const outcomes: LeadOutcome[] = [], added: OutreachLead[] = [];
      for (const raw of leads) {
        let p: Prospect;
        try { p = validateProspect(raw); } catch (e) { outcomes.push({ agency_name: String(raw.agency_name ?? ''), agency_domain: '', outcome: `invalid: ${e instanceof Error ? e.message : 'check the details'}`, lead_id: null }); continue; }
        const domain = agencyDomain(p.agency_url), email = p.contact_email.toLowerCase();
        const clash = (l: { agency_domain: string; contact_email: string }) => l.agency_domain === domain || (!!email && l.contact_email === email);
        const outcome = rows.some((l) => clash({ agency_domain: agencyDomain(l.agency_url), contact_email: l.contact_email })) ? 'already listed' : contacted.some(clash) ? 'already contacted' : 'added';
        let lead_id: string | null = null;
        if (outcome === 'added') {
          const lead: OutreachLead = { ...p, contact_email: email, id: crypto.randomUUID(), created_at: now(), source, fit_note: (raw.fit_note ?? '').trim().slice(0, 300), reviewed: false, status: 'new' };
          rows.push(lead); added.push(lead); lead_id = lead.id;
        }
        outcomes.push({ agency_name: p.agency_name, agency_domain: domain, outcome, lead_id });
      }
      return { outcomes, added };
    },
    async update(id, changes) {
      const lead = rows.find((l) => l.id === id);
      if (!lead) throw new Error('Lead not found.');
      Object.assign(lead, changes);
    },
    async remove(id) {
      const i = rows.findIndex((l) => l.id === id);
      if (i >= 0) rows.splice(i, 1);
    },
  };
}

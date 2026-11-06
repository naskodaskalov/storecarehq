// Server-side storage for the outreach leads (public.outreach_leads, service role only).
// New leads go through add_outreach_leads, which applies the same checks and duplicate rules for every source.
import { COLUMNS } from './outreach.ts';
import { LEAD_LIMIT, memoryLeadStore, type LeadStore, type OutreachLead } from './outreach-leads.ts';

const SELECT = `id,created_at,source,fit_note,reviewed,status,${COLUMNS.join(',')}`;
const OPTIONAL = ['directory_url', 'contact_name', 'contact_email', 'client_store_url', 'portfolio_source_url', 'fit_note'] as const;
type Row = Omit<OutreachLead, typeof OPTIONAL[number]> & Record<typeof OPTIONAL[number], string | null>;
// Optional text is '' on the page. Client store and portfolio are always set on new leads; only backfilled ones can lack them.
const shown = (r: Row): OutreachLead => ({ ...r, ...Object.fromEntries(OPTIONAL.map((k) => [k, r[k] ?? ''])) } as OutreachLead);

// Demo mode starts with two sample leads (reserved .example domains) so the page can be reviewed without a database.
function demoLeads(): OutreachLead[] {
  const at = (days: number) => new Date(Date.now() - days * 864e5).toISOString();
  const lead = (n: number, name: string, domain: string, note: string, days: number): OutreachLead => ({
    id: `00000000-0000-4000-8000-0000000d0${n}00`, created_at: at(days), source: 'research', fit_note: note, reviewed: false, status: 'new',
    agency_name: name, agency_url: `https://${domain}/`, directory_url: '', contact_name: '', contact_email: `hello@${domain}`,
    client_store_url: `https://shop.${domain}/`, portfolio_source_url: `https://${domain}/work`,
  });
  return [lead(1, 'Fernhill Studio', 'fernhill.example', 'Sells a monthly Shopify care plan.', 0), lead(2, 'Tidewater Commerce', 'tidewater.example', 'Mentions post-launch support.', 1)];
}

export async function leadStore(): Promise<LeadStore> {
  if (process.env.STORECARE_DEMO === '1') {
    const scope = globalThis as typeof globalThis & { storecareOutreachLeads?: OutreachLead[] };
    scope.storecareOutreachLeads ||= demoLeads();
    return memoryLeadStore(scope.storecareOutreachLeads);
  }
  const { supabaseAdmin } = await import('./supabase-admin.ts');
  const client = supabaseAdmin();
  const problem = () => new Error('Saved leads are unavailable. Check the outreach-leads migration and server credentials.');
  return {
    async list(limit) {
      const { data, error } = await client.from('outreach_leads').select(SELECT).order('created_at', { ascending: false }).limit(limit);
      if (error) throw problem();
      return ((data ?? []) as unknown as Row[]).map(shown);
    },
    async add(leads, source, addedBy) {
      const { data, error } = await client.rpc('add_outreach_leads', { leads, lead_source: source, added_by: addedBy });
      if (error) throw problem();
      const outcomes = (data ?? []) as { agency_name: string; agency_domain: string; outcome: string; lead_id: string | null }[];
      const ids = outcomes.map((o) => o.lead_id).filter((id): id is string => !!id);
      if (!ids.length) return { outcomes, added: [] };
      const saved = await client.from('outreach_leads').select(SELECT).in('id', ids);
      if (saved.error) throw problem();
      const byId = new Map(((saved.data ?? []) as unknown as Row[]).map((r) => [r.id, shown(r)]));
      return { outcomes, added: ids.map((id) => byId.get(id)).filter((l): l is OutreachLead => !!l) };
    },
    async update(id, changes) {
      const { error } = await client.from('outreach_leads').update({ ...changes, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw problem();
    },
    async remove(id) {
      const { error } = await client.from('outreach_leads').delete().eq('id', id);
      if (error) throw problem();
    },
  };
}

/** For the outreach page: the saved leads, or a reason they are missing. CSV import into the tab still works without them. */
export async function loadOutreachLeads(): Promise<{ leads: OutreachLead[]; error: string | null }> {
  try { return { leads: await (await leadStore()).list(LEAD_LIMIT), error: null }; }
  catch { return { leads: [], error: 'Saved leads could not be loaded. Apply the outreach-leads migration and set SUPABASE_SERVICE_ROLE_KEY.' }; }
}

// Server-side storage for the outreach history (public.outreach_contacts, service role only).
import { summarizeViews } from './outreach-report-views.ts';
import { viewStore } from './outreach-report-views-store.ts';
import { HISTORY_LIMIT, memoryContactStore, type ContactDelivery, type ContactStore, type OutreachContact, type StoredContact } from './outreach-history.ts';

const COLUMNS = 'id,sent_at,sent_by,agency_name,agency_domain,agency_url,contact_name,contact_email,client_store_url,subject,delivery';

// Demo mode shows a short sample history (reserved .example domains) so the page can be reviewed without a database.
function demoHistory(): StoredContact[] {
  const day = 864e5, at = (ago: number) => new Date(Date.now() - ago).toISOString();
  const sample = (n: number, name: string, domain: string, contact: string, ago: number, delivery: ContactDelivery): StoredContact => ({
    id: `00000000-0000-4000-8000-0000000c0${n}00`, sent_at: at(ago), sent_by: 'demo@storecarehq.com', agency_name: name, agency_domain: domain,
    agency_url: `https://${domain}/`, contact_name: contact, contact_email: `${contact.split(' ')[0].toLowerCase()}@${domain}`,
    client_store_url: `https://shop.${domain}/`, subject: `A sample care report for ${name}'s Shopify clients`, delivery,
    body_text: 'Sample introduction.', report_links_id: null, provider_message_id: delivery === 'accepted' ? 'demo' : null, payload_digest: String(n).repeat(64),
  });
  return [sample(1, 'Harbour Digital', 'harbourdigital.example', 'Ellie Ward', 2 * day, 'accepted'), sample(2, 'Copperline Commerce', 'copperline.example', 'Sam Okafor', 9 * day, 'unconfirmed')];
}

export async function contactStore(): Promise<ContactStore> {
  if (process.env.STORECARE_DEMO === '1') {
    const scope = globalThis as typeof globalThis & { storecareOutreachContacts?: StoredContact[] };
    scope.storecareOutreachContacts ||= demoHistory();
    return memoryContactStore(scope.storecareOutreachContacts);
  }
  const { supabaseAdmin } = await import('./supabase-admin.ts');
  const client = supabaseAdmin();
  const problem = () => new Error('Outreach history is unavailable. Check the outreach-contacts migration and server credentials.');
  return {
    async record(row) {
      const inserted = await client.from('outreach_contacts').insert(row).select(COLUMNS).single();
      if (!inserted.error) return inserted.data as OutreachContact;
      if (inserted.error.code !== '23505') throw problem(); // anything but "this email is already recorded"
      if (row.delivery === 'accepted') {
        const { error } = await client.from('outreach_contacts').update({ delivery: 'accepted', provider_message_id: row.provider_message_id })
          .eq('payload_digest', row.payload_digest).eq('delivery', 'unconfirmed');
        if (error) throw problem();
      }
      const { data, error } = await client.from('outreach_contacts').select(COLUMNS).eq('payload_digest', row.payload_digest).single();
      if (error || !data) throw problem();
      return data as OutreachContact;
    },
    async list(limit) {
      const { data, error } = await client.from('outreach_contacts').select(`${COLUMNS},report_links_id`).order('sent_at', { ascending: false }).limit(limit);
      if (error) throw problem();
      return (data ?? []) as (OutreachContact & { report_links_id: string | null })[];
    },
  };
}

/** For the outreach page: the history, or a reason it is missing. Sending still works without it. */
export async function loadOutreachHistory(): Promise<{ contacts: OutreachContact[]; error: string | null }> {
  try {
    const rows = await (await contactStore()).list(HISTORY_LIMIT);
    // Views are extra: if they cannot be loaded, the history still shows (with "views unknown").
    const ids = [...new Set(rows.map((r) => r.report_links_id).filter((id): id is string => !!id))];
    const summaries = await viewStore().then((s) => s.forSnapshots(ids)).then(summarizeViews).catch(() => null);
    const contacts = rows.map(({ report_links_id, ...c }) => ({ ...c, views: summaries && report_links_id ? summaries.get(report_links_id) ?? { health: 0, sample: 0, downloads: 0, automated: 0, first: null, last: null } : null }));
    return { contacts, error: null };
  } catch {
    return { contacts: [], error: 'Outreach history could not be loaded. Apply the outreach-contacts migration and set SUPABASE_SERVICE_ROLE_KEY.' };
  }
}

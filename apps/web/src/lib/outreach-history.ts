// Outreach history: which agencies were already emailed from /admin/outreach. Saved on the server
// (public.outreach_contacts) when an email goes out, so it outlives the browser tab and the JSON backups.
// No server-only imports here: the outreach page uses these helpers in the browser too. Storage: outreach-history-store.ts.
import type { Prospect } from './outreach.ts';
import type { TestEmailInput } from './outreach-email.ts';
import type { TestDeliveryResult } from './outreach-delivery.ts';
import type { ViewSummary } from './outreach-report-views.ts';

export type ContactDelivery = 'accepted' | 'unconfirmed';
/** One sent email, as the admin page shows it. The message text stays on the server. */
export type OutreachContact = {
  id: string;
  sent_at: string;
  sent_by: string;
  agency_name: string;
  agency_domain: string;
  agency_url: string;
  contact_name: string | null;
  contact_email: string;
  client_store_url: string | null;
  subject: string;
  delivery: ContactDelivery;
  /** Opens of the linked reports, when known (attached by loadOutreachHistory). */
  views?: ViewSummary | null;
};
export type NewOutreachContact = Omit<OutreachContact, 'id' | 'sent_at'> & {
  body_text: string;
  report_links_id: string | null;
  provider_message_id: string | null;
  payload_digest: string;
};
export type StoredContact = OutreachContact & Pick<NewOutreachContact, 'body_text' | 'report_links_id' | 'provider_message_id' | 'payload_digest'>;

export interface ContactStore {
  /** Saves a sent email. The same email again (same payload digest) is not a new row; a confirmed retry upgrades it. */
  record(row: NewOutreachContact): Promise<OutreachContact>;
  /** Newest first, with the report-link set each email linked to. */
  list(limit: number): Promise<(OutreachContact & { report_links_id: string | null })[]>;
}

/** How many sent emails the outreach page loads for its history and "contacted before" checks. */
export const HISTORY_LIMIT = 1000;

/** The key an agency is known by: its website host, lower-case, without www. */
export const agencyDomain = (url: string) => new URL(url).hostname.toLowerCase().replace(/^www\./, '');

/** The history row for an email that went out (accepted) or may have (unconfirmed). */
export function contactRow(input: TestEmailInput, sent: { digest: string; to: string }, result: Exclude<TestDeliveryResult, { state: 'failed' }>, sentBy: string): NewOutreachContact {
  const p = input.pack.prospect;
  return {
    sent_by: sentBy.trim().toLowerCase(),
    agency_name: p.agency_name,
    agency_domain: agencyDomain(p.agency_url),
    agency_url: p.agency_url,
    contact_name: p.contact_name || null,
    contact_email: sent.to.trim().toLowerCase(),
    client_store_url: p.client_store_url || null,
    subject: input.subject,
    body_text: input.pack.draft,
    report_links_id: input.pack.links?.id ?? null,
    delivery: result.state === 'accepted' ? 'accepted' : 'unconfirmed',
    provider_message_id: result.state === 'accepted' ? result.id : null,
    payload_digest: sent.digest,
  };
}

/** Earlier emails to this agency, newest first: same website, or same contact address. */
export function previousContacts(p: Pick<Prospect, 'agency_url' | 'contact_email'>, history: OutreachContact[]): OutreachContact[] {
  let domain = '';
  try { domain = agencyDomain(p.agency_url); } catch { /* no usable website: match the address only */ }
  const email = p.contact_email.trim().toLowerCase();
  return history
    .filter((c) => (domain && c.agency_domain === domain) || (email && c.contact_email === email))
    .sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at));
}

/** "2 Nov 2026" in the admin's time zone (explicit, so server and browser render the same text). */
export const contactDay = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone });
export const contactTime = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone });

const shown = ({ body_text: _b, report_links_id: _r, provider_message_id: _p, payload_digest: _d, ...row }: StoredContact): OutreachContact => row;

export function memoryContactStore(rows: StoredContact[] = [], now = () => new Date().toISOString()): ContactStore {
  return {
    async record(row) {
      const existing = rows.find((r) => r.payload_digest === row.payload_digest);
      if (existing) {
        if (existing.delivery === 'unconfirmed' && row.delivery === 'accepted') Object.assign(existing, { delivery: 'accepted', provider_message_id: row.provider_message_id });
        return shown(existing);
      }
      const saved = { ...row, id: crypto.randomUUID(), sent_at: now() };
      rows.push(saved);
      return shown(saved);
    },
    async list(limit) {
      return [...rows].sort((a, b) => Date.parse(b.sent_at) - Date.parse(a.sent_at)).slice(0, limit).map((r) => ({ ...shown(r), report_links_id: r.report_links_id }));
    },
  };
}

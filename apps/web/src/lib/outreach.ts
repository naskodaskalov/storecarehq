import type { QuickReport } from './quick-report.ts';

export const COLUMNS = ['agency_name', 'agency_url', 'directory_url', 'contact_name', 'contact_email', 'client_store_url', 'portfolio_source_url'] as const;
export type Prospect = Record<typeof COLUMNS[number], string>;
export type ReportLinks = { id: string; healthToken: string; sampleToken: string; expiresAt: string; sourceDigest: string; origin: string };
export type Pack = { prospect: Prospect; reviewed: boolean; preparedAt: string; report: QuickReport | null; draft: string; subject?: string; links?: ReportLinks; status: 'new' | 'prepared' | 'contacted' | 'replied' | 'declined' };
const statuses = ['new', 'prepared', 'contacted', 'replied', 'declined'];
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function publicUrl(value: string): string {
  const url = new URL(value.includes('://') ? value : `https://${value}`);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !url.hostname.includes('.') || /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.)/i.test(url.hostname)) throw new Error('Use public http or https URLs.');
  return url.href;
}

export function validateProspect(input: unknown): Prospect {
  if (!object(input)) throw new Error('Invalid agency record.');
  const p = {} as Prospect;
  for (const key of COLUMNS) {
    const v = input[key] ?? '';
    if (typeof v !== 'string' || v.length > (key.endsWith('_url') ? 300 : 120)) throw new Error(`Invalid ${key}.`);
    p[key] = v.trim();
  }
  if (!p.agency_name || !p.agency_url || !p.client_store_url || !p.portfolio_source_url) throw new Error('Agency name, agency URL, client store URL and portfolio source URL are required.');
  if (p.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.contact_email)) throw new Error('Invalid contact email.');
  for (const key of ['agency_url', 'directory_url', 'client_store_url', 'portfolio_source_url'] as const) if (p[key]) p[key] = publicUrl(p[key]);
  return p;
}

export function ensureUnique(packs: Pack[]): Pack[] {
  if (packs.length > 100) throw new Error('Import at most 100 agencies at a time.');
  const domains = new Set<string>(), emails = new Set<string>();
  for (const { prospect: p } of packs) {
    const domain = new URL(p.agency_url).hostname.toLowerCase().replace(/^www\./, '');
    const email = p.contact_email.toLowerCase();
    if (domains.has(domain) || (email && emails.has(email))) throw new Error(`Duplicate agency or contact: ${p.agency_name}.`);
    domains.add(domain); if (email) emails.add(email);
  }
  return packs;
}

export function newPack(p: Prospect): Pack {
  return { prospect: p, reviewed: false, preparedAt: '', report: null, draft: '', status: 'new' };
}

export function parseCsv(source: string): Pack[] {
  if (source.length > 500_000) throw new Error('CSV is too large.');
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false, closed = false;
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else field += c;
    } else if (c === ',' || c === '\n') {
      row.push(field); field = ''; closed = false;
      if (c === '\n') { if (row.some(Boolean)) rows.push(row); row = []; }
    } else if (c === '"' && !field && !closed) quoted = true;
    else { if (closed || c === '"') throw new Error('Malformed CSV quoting.'); field += c; }
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  row.push(field); if (row.some(Boolean)) rows.push(row);
  const header = rows.shift()?.map(s => s.trim());
  if (!header || COLUMNS.some(key => !header.includes(key)) || new Set(header).size !== header.length) throw new Error(`Required CSV headers: ${COLUMNS.join(',')}`);
  if (!rows.length) throw new Error('No agencies found.');
  return ensureUnique(rows.map((r, i) => {
    if (r.length !== header.length) throw new Error(`Wrong column count on record ${i + 2}.`);
    return newPack(validateProspect(Object.fromEntries(header.map((key, n) => [key, r[n]]))));
  }));
}

export function draftMessage(p: Prospect, report: QuickReport): string {
  if (!report.ok) return '';
  // Neutral measurements only: errors and blocked checks must never become sales claims.
  const observation = report.sections.flatMap(s => s.items).find(f => /^Mobile PageSpeed score \d+\/100\./.test(f.text))?.text.match(/^Mobile PageSpeed score \d+\/100\./)?.[0];
  return `Hi ${p.contact_name || 'there'},\n\nI saw ${p.agency_name}'s portfolio reference to ${new URL(p.client_store_url).hostname}. I prepared a one-off public storefront check on ${report.checkedAt.slice(0, 10)}.${observation ? ` One measurement: ${observation}` : ''}\n\nStoreCareHQ helps Shopify agencies monitor client stores and prepare branded monthly care reports. I can share the health check and an illustrative monthly report showing example maintenance work and hours. The sample uses fictional data; the health check is a current snapshot, not historical monitoring or a full checkout test.\n\nWould these be useful for your care-plan workflow?\n\nStoreCareHQ\nhttps://www.storecarehq.com\n\nIf this is not relevant, let me know and I won't follow up.`;
}

export function exportCsv(packs: Pack[]): string {
  const cell = (value: string) => `"${(/^[\s]*[=+@\-\t\r\n]/.test(value) ? "'" : '') + value.replace(/"/g, '""')}"`;
  return [ [...COLUMNS, 'status', 'checked_at', 'subject', 'draft'], ...packs.map(p => [...COLUMNS.map(k => p.prospect[k]), p.status, p.report?.ok ? p.report.checkedAt : '', p.subject || '', p.draft]) ].map(row => row.map(cell).join(',')).join('\r\n');
}

export function serializePacks(packs: Pack[]): string { return JSON.stringify({ version: 1, packs }, null, 2); }

export function restorePacks(source: string): Pack[] {
  if (source.length > 5_000_000) throw new Error('Backup is too large.');
  const data: unknown = JSON.parse(source);
  if (!object(data) || data.version !== 1 || !Array.isArray(data.packs)) throw new Error('Unsupported backup.');
  return ensureUnique(data.packs.map((raw: unknown) => {
    if (!object(raw) || typeof raw.reviewed !== 'boolean' || typeof raw.draft !== 'string' || raw.draft.length > 20000 || typeof raw.preparedAt !== 'string' || !statuses.includes(String(raw.status))) throw new Error('Invalid backup record.');
    if (raw.preparedAt && !Number.isFinite(Date.parse(raw.preparedAt))) throw new Error('Invalid preparation date.');
    if (raw.subject !== undefined && (typeof raw.subject !== 'string' || raw.subject.length > 200 || /[\r\n\x00-\x1f]/.test(raw.subject))) throw new Error('Invalid email subject.');
    let links: ReportLinks | undefined;
    if (raw.links !== undefined) {
      const l = raw.links;
      if (!object(l) || typeof l.id !== 'string' || !/^[a-f0-9-]{36}$/.test(l.id) || !['healthToken', 'sampleToken', 'sourceDigest'].every(k => typeof l[k] === 'string' && /^[a-f0-9]{64}$/.test(l[k] as string)) || typeof l.expiresAt !== 'string' || !Number.isFinite(Date.parse(l.expiresAt)) || typeof l.origin !== 'string') throw new Error('Invalid report links.');
      const origin = new URL(l.origin);
      if (origin.origin !== l.origin || origin.username || origin.password || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)))) throw new Error('Invalid report origin.');
      links = { id: l.id, healthToken: String(l.healthToken), sampleToken: String(l.sampleToken), sourceDigest: String(l.sourceDigest), expiresAt: l.expiresAt, origin: l.origin };
    }
    const report = raw.report;
    if (report !== null) {
      if (!object(report) || typeof report.ok !== 'boolean') throw new Error('Invalid saved report.');
      if (!report.ok) { if (typeof report.error !== 'string') throw new Error('Invalid report error.'); }
      else {
        if (typeof report.url !== 'string' || typeof report.host !== 'string' || typeof report.checkedAt !== 'string' || !Number.isFinite(Date.parse(report.checkedAt)) || !Array.isArray(report.sections)) throw new Error('Invalid report snapshot.');
        publicUrl(report.url);
        if (report.sections.some(s => !object(s) || typeof s.title !== 'string' || !Array.isArray(s.items) || s.items.some((f: unknown) => !object(f) || typeof f.text !== 'string' || !['good', 'look'].includes(String(f.tone))))) throw new Error('Invalid report findings.');
      }
    }
    return { prospect: validateProspect(raw.prospect), reviewed: raw.reviewed, draft: raw.draft, preparedAt: raw.preparedAt, status: raw.status as Pack['status'], report: report as QuickReport | null, ...(raw.subject !== undefined ? { subject: raw.subject as string } : {}), ...(links ? { links } : {}) };
  }));
}

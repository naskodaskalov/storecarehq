import type { QuickReport } from './quick-report.ts';
import { currentOffer, inSeason, leadFinding, offerDay, offerTrialEnd, saleDates, validAudit } from './bfcm.ts';

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

/** The one finding worth opening the email with, rephrased neutrally. Only measured results qualify: a check that
 *  failed, was blocked or could not be read never becomes a claim about the client's store. Most useful first. */
export function headlineFinding(report: QuickReport): string | null {
  if (!report.ok) return null;
  const texts = report.sections.flatMap(s => s.items.filter(i => i.tone === 'look').map(i => i.text));
  const pick = (re: RegExp) => texts.map(t => t.match(re)).find(Boolean) ?? null;
  let m: RegExpMatchArray | null;
  if ((m = pick(/^(\d+) links? from the home page (?:is|are) broken \(of (\d+) checked\)/)))
    return `${m[1]} of the ${m[2]} links I checked on the home page ${m[1] === '1' ? 'returns' : 'return'} an error page`;
  if ((m = pick(/^The SSL certificate expires in (\d+) days? \(([^)]+)\)/))) return `its SSL certificate expires on ${m[2]}`;
  if ((m = pick(/^The domain (\S+) expires in (\d+) days? \(([^)]+)\)/))) return `the domain ${m[1]} is due for renewal on ${m[3]}`;
  if ((m = pick(/^Mobile PageSpeed score (\d+)\/100\.(?: Main content appeared after ([\d.]+)s\.)?/)))
    return `it scores ${m[1]}/100 on Google’s mobile speed test${m[2] ? `, with the main content showing after ${m[2]}s` : ''}`;
  if ((m = pick(/^(\d+) products? (?:has|have) sold-out sizes or variants still listed/)))
    return `${m[1]} product${m[1] === '1' ? '' : 's'} still list${m[1] === '1' ? 's' : ''} sold-out sizes or variants`;
  return null;
}

/** First name for the greeting: the contact's first word, or "there". */
const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'there';

/** Until the day before Black Friday (from two months out), outreach leads with the Black Friday one-pager. */
export function bfcmOutreach(report: QuickReport, now = Date.now()): boolean {
  return report.ok && !!report.bfcm && validAudit(report.bfcm) && inSeason(now) && saleDates(now).daysToBlackFriday >= 1;
}

export function draftMessage(p: Prospect, report: QuickReport, sender = 'Nasko', now = Date.now()): string {
  if (!report.ok) return '';
  const store = new URL(p.client_store_url).hostname.replace(/^www\./, '');
  if (bfcmOutreach(report, now)) {
    const days = saleDates(now).daysToBlackFriday;
    const lead = leadFinding(report.bfcm!);
    // The button on the hosted one-pager signs them up with this store filled in; until the offer's end it's free.
    const free = offerTrialEnd(currentOffer(now), now);
    return [
      `Hi ${firstName(p.contact_name)},`,
      `I came across ${store} in your portfolio and, with Black Friday ${days} day${days === 1 ? '' : 's'} out, ran a quick readiness check on it from the outside. ${lead ? `One thing stood out: ${lead}.` : 'It looks ready from the outside.'} The one-page result is linked below.`,
      `I'm building StoreCare HQ. It runs the same check on all your client stores in one click and gives you a one-pager for each client in your branding. After the sale it keeps watching them every day (uptime, a daily test checkout, speed, theme and app changes) and sends a monthly report under your name.`,
      `There's a button on the one-pager to run it on your other client stores${free ? `, free until ${offerDay(free)}` : ' with a free trial'}. Or reply and I'll set it up with you.`,
      `${sender}\nStoreCare HQ · storecarehq.com`,
    ].join('\n\n');
  }
  const finding = headlineFinding(report);
  return [
    `Hi ${firstName(p.contact_name)},`,
    `I came across ${store} in your portfolio and ran a quick outside check on it. ${finding ? `One thing stood out: ${finding}.` : 'Nothing urgent came up.'} The full one-page result is linked below.`,
    `I'm building StoreCare HQ. It watches all your client stores every day (uptime, a daily checkout test, speed, theme and app changes), alerts you the moment something breaks, and turns it into a branded monthly report with your work log and hours, sent under your name.`,
    `Would that help with your care plans? I'm setting up the first agencies free.`,
    `${sender}\nStoreCare HQ · storecarehq.com`,
  ].join('\n\n');
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
        if (report.bfcm !== undefined && !validAudit(report.bfcm)) throw new Error('Invalid Black Friday check.');
      }
    }
    return { prospect: validateProspect(raw.prospect), reviewed: raw.reviewed, draft: raw.draft, preparedAt: raw.preparedAt, status: raw.status as Pack['status'], report: report as QuickReport | null, ...(raw.subject !== undefined ? { subject: raw.subject as string } : {}), ...(links ? { links } : {}) };
  }));
}

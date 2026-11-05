// The BFCM one-pager sent to the store's owner: the agency's branded email layout with the fixes up front.

import { brandedEmailHtml, emailParagraphs } from './report-email.ts';
import { CHECK_LABELS, shortDate, type BfcmAudit } from './bfcm.ts';

export type AuditEmail = { agencyName: string; brandColor: string; audit: BfcmAudit; note: string | null; link: string; replyTo?: string | null; contactName?: string | null };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const hash = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
};

/** One audit, with one version of the agency's note, to one address is one email (Resend keeps keys 24 hours). */
export function auditEmailKey(auditId: string, note: string | null, to: string): string {
  return `bfcm/${auditId}/${hash(note ?? '')}/${to.trim().toLowerCase()}`.slice(0, 256);
}

export const auditEmailSubject = (a: Pick<BfcmAudit, 'storeName'>) => `${a.storeName}: Black Friday readiness check`;

export function auditLead(a: BfcmAudit): string {
  const when = `We checked ${a.storeName} ahead of Black Friday (${shortDate(a.sale.blackFriday)}).`;
  if (a.fixes) return `${when} There ${a.fixes === 1 ? 'is' : 'are'} ${plural(a.fixes, 'thing')} to fix before the sale.`;
  if (a.verdict === 'partial') return `${when} We couldn’t load the storefront itself, so some checks didn’t run.`;
  if (a.looks) return `${when} It’s ready, with ${plural(a.looks, 'thing')} worth a look.`;
  return `${when} It’s ready for the sale.`;
}

const fixLines = (a: BfcmAudit) => a.items.filter((i) => i.tone === 'fix').slice(0, 5).map((i) => `${CHECK_LABELS[i.key]}: ${i.text}`);

export function auditEmailText(e: AuditEmail): string {
  const first = e.contactName?.trim().split(/\s+/)[0];
  return [
    ...(first ? [`Hi ${first},`] : []),
    auditLead(e.audit),
    ...(fixLines(e.audit).length ? [fixLines(e.audit).map((l) => `• ${l}`).join('\n')] : []),
    ...(e.note?.trim() ? [e.note.trim()] : []),
    `The one-page check: ${e.link}`,
    e.agencyName,
  ].join('\n\n');
}

export function auditEmailHtml(e: AuditEmail): string {
  const a = e.audit;
  const note = e.note?.trim() ? e.note.trim().split(/\n+/).map((p) => p.trim()).filter(Boolean) : [];
  return brandedEmailHtml({
    agencyName: e.agencyName,
    brandColor: e.brandColor,
    title: auditEmailSubject(a),
    kicker: `Black Friday readiness check for ${a.storeName}`,
    eyebrow: `${a.storeName} · Black Friday ${shortDate(a.sale.blackFriday)}`,
    heading: 'Black Friday readiness',
    lead: auditLead(a),
    body: emailParagraphs([...fixLines(a), ...note]),
    button: 'View the one-page check',
    link: e.link,
    footnote: 'The check covers whether the store is open and listed on Google, the test checkout, speed, stock on the products the home page promotes, links, and certificate and domain renewals.',
    replyTo: e.replyTo,
  });
}

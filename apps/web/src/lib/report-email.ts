// One report version to one address is one email. Used as Resend's Idempotency-Key (1–256 characters, kept 24h).

export function reportEmailKey(reportId: string, version: string, to: string): string {
  return `report/${reportId}/${version}/${to.trim().toLowerCase()}`.slice(0, 256);
}

// The client-facing email: same layout as StoreCare HQ's own emails, but signed and coloured by the agency.
export type ReportEmail = { agencyName: string; brandColor: string; storeName: string; periodLabel: string; summary: string; link: string; replyTo?: string | null };

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** A brand colour safe to put in a style attribute, and a readable text colour on top of it. */
export function brandColours(input: string): { accent: string; onAccent: string } {
  const accent = /^#[0-9a-f]{6}$/i.test(input) ? input : '#087f75';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Contrast with white is (1.05)/(lum+0.05); with the dark ink #1d3034 (lum ≈ 0.026) it is (lum+0.05)/0.076.
  return { accent, onAccent: 1.05 / (lum + 0.05) >= (lum + 0.05) / 0.076 ? '#ffffff' : '#1d3034' };
}

const initials = (name: string) => name.split(/[\s.\-_]+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || 'R';

export function reportEmailSubject(e: Pick<ReportEmail, 'storeName' | 'periodLabel'>) {
  return `${e.storeName}: your ${e.periodLabel} care report`;
}

export function reportEmailText(e: ReportEmail) {
  return `${e.summary}\n\nRead the full report: ${e.link}\n\n${e.agencyName}`;
}

/** Plain-text paragraphs as the email's body HTML (escaped). */
export const emailParagraphs = (paragraphs: string[]) =>
  paragraphs.map((p) => `<p style="margin:0 0 18px;font-size:15px;line-height:25px;color:#596f72;">${esc(p)}</p>`).join('\n');

/** The agency-branded email layout shared by client emails. Text fields are plain text; `body` is escaped HTML. */
export type BrandedEmail = {
  agencyName: string;
  brandColor: string;
  title: string;
  kicker: string;
  eyebrow: string;
  heading: string;
  lead: string;
  body: string;
  button: string;
  link: string;
  footnote: string;
  replyTo?: string | null;
};

export function brandedEmailHtml(e: BrandedEmail): string {
  const { accent, onAccent } = brandColours(e.brandColor);
  const link = /^https?:\/\/\S+$/.test(e.link) ? esc(e.link) : '#';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(e.title)}</title>
<style>@media only screen and (max-width:600px){.outer{padding:20px 12px!important}.content{padding:32px 24px!important}.heading{font-size:28px!important}.brand{padding:26px 24px!important}}</style></head>
<body style="margin:0;padding:0;background-color:#eef3f2;color:#203438;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;color:#eef3f2;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${esc(e.lead)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#eef3f2;"><tr><td class="outer" align="center" style="padding:48px 20px;">
<!--[if mso]><table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;border:1px solid #dce6e3;border-radius:16px;overflow:hidden;background-color:#ffffff;">
<tr><td class="brand" bgcolor="#1d3034" style="padding:30px 40px;background-color:#1d3034;border-radius:15px 15px 0 0;border-bottom:4px solid ${accent};">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="38" height="36" align="center" bgcolor="${accent}" style="background-color:${accent};border-radius:9px;color:${onAccent};font-size:14px;font-weight:bold;letter-spacing:-0.5px;">${esc(initials(e.agencyName))}</td><td style="padding-left:12px;font-size:21px;letter-spacing:-0.7px;font-weight:bold;color:#ffffff;">${esc(e.agencyName)}</td></tr></table>
<p style="margin:23px 0 0;font-size:12px;line-height:19px;color:#b9d1cd;">${esc(e.kicker)}</p></td></tr>
<tr><td class="content" style="padding:40px;">
<p style="margin:0 0 14px;color:#596f72;font-size:11px;line-height:16px;font-weight:bold;letter-spacing:1.6px;">${esc(e.eyebrow.toUpperCase())}</p>
<h1 class="heading" style="margin:0 0 14px;color:#1d3034;font-size:34px;line-height:1.15;letter-spacing:-1px;font-weight:bold;">${esc(e.heading)}</h1>
<p style="margin:0 0 24px;font-size:17px;line-height:26px;color:#314c50;">${esc(e.lead)}</p>
${e.body}
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;"><tr><td align="center" bgcolor="${accent}" style="border-radius:7px;background-color:${accent};mso-padding-alt:16px 26px;">
<a href="${link}" style="display:inline-block;padding:16px 26px;border:1px solid ${accent};border-radius:7px;font-size:15px;line-height:20px;font-weight:bold;color:${onAccent};text-decoration:none;">${esc(e.button)}</a></td></tr></table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#f0f7f5" style="padding:16px 18px;border-left:3px solid ${accent};background-color:#f0f7f5;font-size:13px;line-height:21px;color:#3f6260;">${esc(e.footnote)}${e.replyTo ? ' Questions? Just reply to this email.' : ''}</td></tr></table>
<p style="margin:28px 0 10px;font-size:12px;line-height:20px;color:#687e80;">Button not working? Copy and paste this link into your browser:</p>
<p style="margin:0;font-size:11px;line-height:18px;word-break:break-all;overflow-wrap:anywhere;"><a href="${link}" style="color:#087f75;text-decoration:underline;word-break:break-all;">${link}</a></p>
<p style="margin:28px 0 0;font-size:15px;line-height:24px;color:#314c50;">${esc(e.agencyName)}</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
<p style="max-width:500px;margin:24px 0 0;font-size:11px;line-height:19px;color:#718581;">Sent by ${esc(e.agencyName)} with StoreCare HQ &nbsp;·&nbsp; Care made visible.</p>
</td></tr></table></body></html>\n`;
}

export function reportEmailHtml(e: ReportEmail): string {
  const paragraphs = e.summary.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const [lead = `Here is how ${e.storeName} did in ${e.periodLabel}.`, ...rest] = paragraphs;
  return brandedEmailHtml({
    agencyName: e.agencyName,
    brandColor: e.brandColor,
    title: reportEmailSubject(e),
    kicker: `Monthly care report for ${e.storeName}`,
    eyebrow: `${e.storeName} · ${e.periodLabel}`,
    heading: `Your ${e.periodLabel} care report`,
    lead,
    body: emailParagraphs(rest),
    button: 'Read the full report',
    link: e.link,
    footnote: 'The full report covers uptime, speed, checkout tests, changes to the store and the work we did this month.',
    replyTo: e.replyTo,
  });
}

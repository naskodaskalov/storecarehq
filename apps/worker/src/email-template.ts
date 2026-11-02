// Branded HTML for the worker's emails (alerts and "reports ready"), matching the Supabase auth emails built by
// scripts/build-auth-emails.mjs. Deliveries are queued as plain text (also used for Slack and as the text part),
// so the HTML is derived from that text at send time. Every dynamic value is escaped.

export type EmailItem = { name: string; url: string };
export type EmailContent = {
  label: string;
  tone: 'alert' | 'ok' | 'info';
  title: string;
  lead: string;
  paragraphs: string[];
  items: EmailItem[];
  action: { label: string; url: string } | null;
  note: string;
  preview: string;
};

const URL_RE = /^https:\/\/[^\s"'<>]+$/;
const safeUrl = (u: string) => (URL_RE.test(u) ? u : null);

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const RECOVERED = /back up|working again|is back|recovered/i;

/** Reads the queued plain text back into parts. Formats written by notify(), queue_monitor_event() and sendReportDigests(). */
export function parseAlertText(subject: string, text: string): EmailContent {
  const lines = text.split('\n').map((l) => l.trim());
  const items: EmailItem[] = [];
  const rest: string[] = [];
  let action: EmailContent['action'] = null;
  for (const l of lines) {
    const item = /^• (.+?): (https:\/\/\S+)$/.exec(l);
    if (item && safeUrl(item[2])) { items.push({ name: item[1], url: item[2] }); continue; }
    const link = /^(?:(.+?): )?(https:\/\/\S+)$/.exec(l);
    if (link && safeUrl(link[2])) { action = { label: link[1] ?? '', url: link[2] }; continue; }
    if (l) rest.push(l);
  }

  const tagged = /^\[(.+?)\] (.+)$/.exec(subject);
  if (tagged) {
    // Alert: "Store: Title" first line, then the explanation.
    const [, store, title] = tagged;
    if (rest[0] === `${store}: ${title}`) rest.shift();
    const ok = RECOVERED.test(title);
    const [rawLead = ok ? 'The latest check passed.' : 'A monitoring check needs your attention.', ...paragraphs] = rest;
    const lead = /[.!?]$/.test(rawLead) ? rawLead : `${rawLead}.`;
    return {
      label: store.toUpperCase(), tone: ok ? 'ok' : 'alert', title, lead, paragraphs, items,
      action: action && { label: 'Open the store in StoreCare HQ', url: action.url },
      note: ok
        ? 'Nothing more to do. The incident is closed and will appear in this month’s report.'
        : 'We keep checking. You will get another email as soon as it is working again.',
      preview: `${store}: ${lead}`,
    };
  }

  // Digest: first line repeats the subject, then the explanation.
  if (rest[0]?.replace(/\.$/, '') === subject) rest.shift();
  const [lead = '', ...paragraphs] = rest;
  const nothingSent = paragraphs.findIndex((p) => /^Nothing goes to clients/.test(p));
  const note = nothingSent >= 0 ? paragraphs.splice(nothingSent, 1)[0] : '';
  return {
    label: items.length ? 'MONTHLY REPORTS' : 'STORECARE HQ', tone: 'info', title: subject, lead, paragraphs, items,
    action: action && { label: items.length > 1 ? 'Review all reports' : 'Open reports', url: action.url },
    note, preview: lead,
  };
}

const LABEL_COLOUR = { alert: '#b4372b', ok: '#087f75', info: '#087f75' } as const;

export function renderEmail(subject: string, e: EmailContent): string {
  const x = escapeHtml;
  const button = e.action
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;"><tr><td align="center" bgcolor="#087f75" style="border-radius:7px;background-color:#087f75;mso-padding-alt:16px 26px;">
<a href="${x(e.action.url)}" style="display:inline-block;padding:16px 26px;border:1px solid #087f75;border-radius:7px;font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;">${x(e.action.label)}</a></td></tr></table>`
    : '';
  const items = e.items.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 28px;border:1px solid #e0e8e5;border-radius:10px;">${e.items
        .map((it, i) => `<tr><td style="padding:14px 18px;${i ? 'border-top:1px solid #e0e8e5;' : ''}font-size:15px;line-height:22px;color:#1d3034;font-weight:bold;">${x(it.name)}</td>
<td align="right" style="padding:14px 18px;${i ? 'border-top:1px solid #e0e8e5;' : ''}font-size:14px;line-height:22px;white-space:nowrap;"><a href="${x(it.url)}" style="color:#087f75;font-weight:bold;text-decoration:none;">Review&nbsp;→</a></td></tr>`)
        .join('\n')}</table>`
    : '';
  const paragraphs = e.paragraphs.map((p) => `<p style="margin:0 0 18px;font-size:15px;line-height:25px;color:#596f72;">${x(p)}</p>`).join('\n');
  const note = e.note
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#f0f7f5" style="padding:16px 18px;border-left:3px solid #99cdbf;background-color:#f0f7f5;font-size:13px;line-height:21px;color:#3f6260;">${x(e.note)}</td></tr></table>`
    : '';
  const fallback = e.action
    ? `<p style="margin:28px 0 10px;font-size:12px;line-height:20px;color:#687e80;">Button not working? Copy and paste this link into your browser:</p>
<p style="margin:0;font-size:11px;line-height:18px;word-break:break-all;overflow-wrap:anywhere;"><a href="${x(e.action.url)}" style="color:#087f75;text-decoration:underline;word-break:break-all;">${x(e.action.url)}</a></p>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${x(subject)}</title>
<style>@media only screen and (max-width:600px){.outer{padding:20px 12px!important}.content{padding:32px 24px!important}.heading{font-size:28px!important}.brand{padding:26px 24px!important}}</style></head>
<body style="margin:0;padding:0;background-color:#eef3f2;color:#203438;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;color:#eef3f2;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${x(e.preview)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#eef3f2;"><tr><td class="outer" align="center" style="padding:48px 20px;">
<!--[if mso]><table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;border:1px solid #dce6e3;border-radius:16px;overflow:hidden;background-color:#ffffff;">
<tr><td class="brand" bgcolor="#1d3034" style="padding:30px 40px;background-color:#1d3034;border-radius:15px 15px 0 0;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="38" height="36" align="center" style="border:2px solid #93d3c5;border-radius:9px;color:#a9e0d3;font-size:14px;font-weight:bold;letter-spacing:-1px;">SC</td><td style="padding-left:12px;font-size:21px;letter-spacing:-0.7px;font-weight:bold;color:#ffffff;">StoreCare HQ</td></tr></table>
<p style="margin:23px 0 0;font-size:12px;line-height:19px;color:#b9d1cd;">Behind every thriving store is a team that cares.</p></td></tr>
<tr><td class="content" style="padding:40px;">
<p style="margin:0 0 14px;color:${LABEL_COLOUR[e.tone]};font-size:11px;line-height:16px;font-weight:bold;letter-spacing:1.6px;">${x(e.label)}</p>
<h1 class="heading" style="margin:0 0 14px;color:#1d3034;font-size:34px;line-height:1.15;letter-spacing:-1px;font-weight:bold;">${x(e.title)}</h1>
<p style="margin:0 0 24px;font-size:17px;line-height:26px;color:#314c50;">${x(e.lead)}</p>
${paragraphs}
${items}
${button}
${note}
${fallback}
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
<p style="max-width:500px;margin:24px 0 0;font-size:11px;line-height:19px;color:#718581;">StoreCare HQ &nbsp;·&nbsp; Care made visible.<br>You get this because your address is on your agency’s alert list. Change it under Alerts in each store’s settings.</p>
</td></tr></table></body></html>\n`;
}

export const alertEmailHtml = (subject: string, text: string) => renderEmail(subject, parseAlertText(subject, text));

import { restorePacks, type Pack } from './outreach.ts';
import { SAMPLE_NOTICE, sampleMonthReport } from './sample-month-report.ts';

export type TestEmailInput = { pack: Pack; subject: string };
export type EmailDocument = { filename: string; html: string };
export type OutreachEmail = { subject: string; html: string; text: string; documents: EmailDocument[] };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function defaultOutreachSubject(agency: string) { return `A sample care report for ${agency}'s Shopify clients`; }

function document(title: string, kicker: string, content: string, brand = 'StoreCare HQ'): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(title)}</title>
<style>@media only screen and (max-width:600px){.outer{padding:20px 12px!important}.content{padding:28px 24px!important}.heading{font-size:28px!important}.brand{padding:26px 24px!important}}p{line-height:1.6}li{margin-bottom:10px}td{overflow-wrap:anywhere}</style></head>
<body style="margin:0;background:#eef3f2;color:#203438;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f2"><tr><td class="outer" align="center" style="padding:48px 20px">
<!--[if mso]><table role="presentation" width="560"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border:1px solid #dce6e3;border-radius:16px;overflow:hidden;background:#fff">
<tr><td class="brand" bgcolor="#1d3034" style="padding:30px 40px;border-bottom:4px solid #2747a8;border-radius:15px 15px 0 0">
<table role="presentation"><tr><td bgcolor="#2747a8" style="padding:9px;border-radius:9px;color:#fff;font-size:14px;font-weight:bold">SC</td><td style="padding-left:12px;font-size:21px;font-weight:bold;color:#fff">${esc(brand)}</td></tr></table>
<p style="margin:23px 0 0;font-size:12px;color:#b9d1cd">${esc(kicker)}</p></td></tr>
<tr><td class="content" style="padding:40px"><h1 class="heading" style="margin:0 0 24px;font-size:34px;line-height:1.15;letter-spacing:-1px;color:#1d3034">${esc(title)}</h1>${content}</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
<p style="max-width:500px;margin:24px 0 0;font-size:11px;color:#718581">Prepared with StoreCare HQ · Care made visible.</p></td></tr></table></body></html>`;
}

export function validateTestEmail(input: unknown): TestEmailInput {
  if (!input || typeof input !== 'object') throw new Error('Invalid email.');
  const raw = input as TestEmailInput;
  const serialized = JSON.stringify({ version: 1, packs: [raw.pack] });
  if (serialized.length > 200_000) throw new Error('This report is too large to email.');
  const pack = restorePacks(serialized)[0];
  if (!pack.reviewed || !pack.report?.ok) throw new Error('Review the agency and prepare a successful health check first.');
  if (!pack.draft.trim()) throw new Error('Write an introduction before approving.');
  if (typeof raw.subject !== 'string' || !raw.subject.trim() || raw.subject.length > 200 || /[\r\n\x00-\x1f]/.test(raw.subject)) throw new Error('Enter a subject of up to 200 characters, without line breaks.');
  const r = pack.report;
  if (r.sections.length > 16 || r.sections.some(s => s.title.length > 160 || s.items.length > 100 || s.items.some(i => i.text.length > 3000))) throw new Error('Report findings are too large.');
  return { pack, subject: raw.subject.trim() };
}

export function outreachEmail(input: TestEmailInput): OutreachEmail {
  const { pack, subject } = validateTestEmail(input);
  const report = pack.report;
  if (!report?.ok) throw new Error('Health check is unavailable.');
  const sample = sampleMonthReport(pack.prospect.agency_name, pack.preparedAt || report.checkedAt);
  const health = document('Current store health check', `Prepared for ${pack.prospect.agency_name}`, `<p><strong>${esc(report.host)}</strong><br>Checked: ${esc(report.checkedAt)}</p><p>A one-off public storefront snapshot. No historical monitoring or full checkout test. Unavailable checks require verification.</p>${report.sections.map(s => `<h2 style="font-size:19px">${esc(s.title)}</h2><ul>${s.items.map(i => `<li>${esc(i.text)}</li>`).join('')}</ul>`).join('')}`);
  const f = sample.facts;
  const sampleHtml = document(`Your ${f.period.label} care report`, SAMPLE_NOTICE, `<p style="padding:16px;background:#fff4cf;border-left:3px solid #a17b24">${esc(SAMPLE_NOTICE)}</p><p><strong>${esc(f.storeName)}</strong><br>${esc(f.storeHost)}</p><h2>Illustrative store health</h2><p>Uptime: ${f.uptimePct}% (${f.uptimeChecks} sample checks) · Health score: ${f.healthScore}/100 · Mobile load: 2.1s. All metrics are fictional.</p><h2>Example work · ${f.work.hoursUsed}h of ${f.work.hoursIncluded}h</h2><table width="100%" cellspacing="0" cellpadding="10">${f.work.entries.map(w => `<tr><td style="border-bottom:1px solid #dce6e3">${esc(w.date)}</td><td style="border-bottom:1px solid #dce6e3">${esc(w.text)}</td><td style="border-bottom:1px solid #dce6e3;white-space:nowrap">${w.hours}h</td></tr>`).join('')}</table><p>${esc(SAMPLE_NOTICE)}</p>`, f.agencyName);
  const note = 'Open the reports below to view, download or save them as PDF. The health check is a dated public storefront snapshot. The monthly sample uses fictional monitoring data, tasks and hours. No work was performed.';
  const links = pack.links;
  const urls = links ? { health: `${links.origin}/outreach/r/${links.healthToken}`, sample: `${links.origin}/outreach/r/${links.sampleToken}` } : null;
  const button = (url: string, label: string) => `<p style="margin:28px 0"><a href="${esc(url)}" style="display:inline-block;padding:16px 26px;border-radius:7px;background:#2747a8;color:#fff;text-decoration:none;font-size:15px;font-weight:bold">${label}</a></p>`;
  const buttons = urls ? `${button(urls.health, 'View store health check')}${button(urls.sample, 'View sample monthly report')}<p style="font-size:12px;overflow-wrap:anywhere;word-break:break-all">Health check: <a href="${esc(urls.health)}">${esc(urls.health)}</a><br>Sample report: <a href="${esc(urls.sample)}">${esc(urls.sample)}</a></p><p style="font-size:12px">Links expire on ${esc(links!.expiresAt.slice(0, 10))}. Anyone with a link can view its report until expiry or revocation.</p>` : '<p>Create report links in the admin screen before approving this email.</p>';
  const paragraphs = pack.draft.split(/\n\s*\n/).filter(Boolean).map(p => `<p style="margin:0 0 18px;font-size:16px;line-height:26px;color:#314c50">${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const html = document('Make your Shopify care work visible.', `Prepared for ${pack.prospect.agency_name}`, `${paragraphs}<table role="presentation" width="100%"><tr><td bgcolor="#f0f7f5" style="padding:16px 18px;border-left:3px solid #2747a8;font-size:13px;line-height:21px">${esc(note)}</td></tr></table>${buttons}<p style="font-size:12px;color:#687e80">Website: <a href="https://www.storecarehq.com" style="color:#087f75">https://www.storecarehq.com</a></p>`);
  return { subject: `${subject}`, html, text: `${pack.draft}\n\n${note}\n\n${urls ? `Health check: ${urls.health}\nSample monthly report: ${urls.sample}\nLinks expire: ${links!.expiresAt}` : 'Create report links before approving.'}\n\nhttps://www.storecarehq.com\n\n`, documents: [{ filename: 'current-health-check.html', html: health }, { filename: 'sample-monthly-report.html', html: sampleHtml }] };
}

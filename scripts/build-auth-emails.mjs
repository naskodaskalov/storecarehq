import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../supabase/templates/', import.meta.url);
const emails = [
  { id: 'confirmation', subject: 'Confirm your email — StoreCare HQ', label: 'WELCOME TO STORECARE',
    title: 'Great care starts here.', lead: 'Confirm your email to get your agency workspace ready.',
    body: 'You’re one step away from a clearer view of your client stores, dependable monitoring, and reports that show the value of your work.',
    action: 'Confirm my email', note: 'Once confirmed, we’ll help you add your first store and set up your care plan.',
    safety: 'Didn’t create a StoreCare HQ account? You can safely ignore this email.', preview: 'Confirm your email and get your agency workspace ready.' },
  { id: 'recovery', subject: 'Reset your password — StoreCare HQ', label: 'ACCOUNT SECURITY',
    title: 'A fresh start.', lead: 'Let’s get you back to your workspace.',
    body: 'We received a request to reset your StoreCare HQ password. Use the button below to choose a new one. If you’ve always signed in with email links, you can use it to set your first password, too.',
    action: 'Set a new password', note: 'Your password stays the same until you choose and save a new one.',
    safety: 'Didn’t request this? Ignore this email. No changes will be made to your account.', preview: 'Choose a new password for your StoreCare HQ account.' },
  { id: 'magic-link', subject: 'Your sign-in link — StoreCare HQ', label: 'YOUR AGENCY WORKSPACE',
    title: 'Your stores are waiting.', lead: 'A clear view. A little peace of mind.',
    body: 'Here’s the secure sign-in link you requested. Use it to return to your StoreCare HQ workspace and pick up where you left off.',
    action: 'Sign in to StoreCare', note: 'Prefer using a password? You can set one from your workspace after signing in.',
    safety: 'Didn’t request a sign-in link? You can safely ignore this email.', preview: 'Your secure sign-in link for StoreCare HQ is ready.' },
];

const escape = value => value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function render(e) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(e.subject)}</title>
<style>@media only screen and (max-width:600px){.outer{padding:20px 12px!important}.content{padding:32px 24px!important}.heading{font-size:30px!important}.brand{padding:26px 24px!important}}</style></head>
<body style="margin:0;padding:0;background-color:#eef3f2;color:#203438;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;color:#eef3f2;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escape(e.preview)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#eef3f2;"><tr><td class="outer" align="center" style="padding:48px 20px;">
<!--[if mso]><table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;border:1px solid #dce6e3;border-radius:16px;overflow:hidden;background-color:#ffffff;">
<tr><td class="brand" bgcolor="#1d3034" style="padding:30px 40px;background-color:#1d3034;border-radius:15px 15px 0 0;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="38" height="36" align="center" style="border:2px solid #93d3c5;border-radius:9px;color:#a9e0d3;font-size:14px;font-weight:bold;letter-spacing:-1px;">SC</td><td style="padding-left:12px;font-size:21px;letter-spacing:-0.7px;font-weight:bold;color:#ffffff;">StoreCare HQ</td></tr></table>
<p style="margin:23px 0 0;font-size:12px;line-height:19px;color:#b9d1cd;">Behind every thriving store is a team that cares.</p></td></tr>
<tr><td class="content" style="padding:40px;">
<p style="margin:0 0 14px;color:#087f75;font-size:11px;line-height:16px;font-weight:bold;letter-spacing:1.6px;">${escape(e.label)}</p>
<h1 class="heading" style="margin:0 0 14px;color:#1d3034;font-size:34px;line-height:1.15;letter-spacing:-1px;font-weight:bold;">${escape(e.title)}</h1>
<p style="margin:0 0 18px;font-size:17px;line-height:26px;color:#314c50;">${escape(e.lead)}</p>
<p style="margin:0 0 28px;font-size:15px;line-height:25px;color:#596f72;">${escape(e.body)}</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="#087f75" style="border-radius:7px;background-color:#087f75;mso-padding-alt:16px 26px;">
<a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:16px 26px;border:1px solid #087f75;border-radius:7px;font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;">${escape(e.action)}</a></td></tr></table>
<p style="margin:16px 0 28px;font-size:12px;line-height:20px;color:#687e80;">This link can be used once. Open it in the same browser where you requested it.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="#f0f7f5" style="padding:16px 18px;border-left:3px solid #99cdbf;background-color:#f0f7f5;font-size:13px;line-height:21px;color:#3f6260;">${escape(e.note)}</td></tr></table>
<p style="margin:28px 0 10px;font-size:12px;line-height:20px;color:#687e80;">Button not working? Copy and paste this link into your browser:</p>
<p style="margin:0;font-size:11px;line-height:18px;word-break:break-all;overflow-wrap:anywhere;"><a href="{{ .ConfirmationURL }}" style="color:#087f75;text-decoration:underline;word-break:break-all;">{{ .ConfirmationURL }}</a></p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding-top:28px;"><div style="border-top:1px solid #e0e8e5;height:1px;font-size:1px;line-height:1px;">&nbsp;</div></td></tr></table>
<p style="margin:22px 0 0;font-size:12px;line-height:20px;color:#687e80;">${escape(e.safety)}</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
<p style="max-width:500px;margin:24px 0 0;font-size:11px;line-height:19px;color:#718581;">StoreCare HQ &nbsp;·&nbsp; Care made visible.<br>This is an automated account email. Please don’t reply.</p>
</td></tr></table></body></html>\n`;
}

await mkdir(output,{recursive:true});
const config = {};
for (const e of emails) {
  const html = render(e);
  await writeFile(new URL(`${e.id}.html`, output), html);
  const key = e.id === 'magic-link' ? 'magic_link' : e.id;
  config[`mailer_subjects_${key}`] = e.subject;
  config[`mailer_templates_${key}_content`] = html;
}
await writeFile(new URL('auth-email-config.json', output), JSON.stringify(config,null,2)+'\n');
console.log(`Built ${emails.length} auth email templates in ${fileURLToPath(output)}`);

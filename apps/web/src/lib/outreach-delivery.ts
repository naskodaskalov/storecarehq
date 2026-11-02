// Server-side transport boundary. Keep provider details out of the email composer.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { outreachEmail, type TestEmailInput } from './outreach-email.ts';

export type TestDeliveryConfig = { apiKey: string; from: string; adminEmail: string; demo: boolean; mode?: 'agency' | 'test' };
export type TestDeliveryResult = { state: 'accepted'; id: string } | { state: 'failed' | 'unknown'; error: string };
const emailAddress = /^[^\s@<>;,\r\n]+@[^\s@<>;,\r\n]+\.[^\s@<>;,\r\n]+$/;
const ttl = 15 * 60_000;

export function testDeliveryConfig(adminEmail: string, env: Record<string, string | undefined> = process.env): TestDeliveryConfig {
  return { apiKey: env.RESEND_API_KEY || '', from: env.OUTREACH_FROM || 'StoreCare HQ <support@storecarehq.com>', adminEmail: adminEmail.trim().toLowerCase(), demo: env.STORECARE_DEMO === '1', mode: 'agency' };
}

function assertReady(c: TestDeliveryConfig) {
  if (c.demo) throw new Error('Demo mode previews only. Sign in to send email.');
  if (!c.apiKey) throw new Error('Configure RESEND_API_KEY to send email.');
  const sender = c.from.match(/<([^<>]+)>$/)?.[1] || c.from;
  if (!emailAddress.test(sender) || /[\r\n]/.test(c.from)) throw new Error('Configure a valid OUTREACH_FROM sender on a verified domain.');
  if (!emailAddress.test(c.adminEmail)) throw new Error('Your signed-in admin email is not a valid reply address.');
}

function payloadFor(input: TestEmailInput, c: TestDeliveryConfig) {
  assertReady(c);
  if (!input.pack.links) throw new Error('Create report links before approving or sending.');
  const email = outreachEmail(input);
  const to = c.mode === 'agency' ? input.pack.prospect.contact_email.trim().toLowerCase() : c.adminEmail;
  if (!emailAddress.test(to)) throw new Error('Add one valid agency contact_email to the CSV before approving or sending.');
  return { from: c.from, to: [to], reply_to: c.adminEmail, subject: email.subject, html: email.html, text: email.text };
}
const digestOf = (payload: unknown) => createHash('sha256').update(JSON.stringify(payload)).digest('hex');

/** The recipient and duplicate-prevention digest of the email an approval sends, for the outreach history. */
export function deliveryFingerprint(input: TestEmailInput, c: TestDeliveryConfig): { digest: string; to: string } {
  const payload = payloadFor(input, c);
  return { digest: digestOf(payload), to: payload.to[0] };
}
const signature = (data: string, key: string, mode: string) => createHmac('sha256', key).update(`storecare-outreach-${mode}/v2/${data}`).digest('base64url');

export function approveTestDelivery(input: TestEmailInput, c: TestDeliveryConfig, now = Date.now()) {
  const payload = payloadFor(input, c);
  const expiresAt = now + ttl;
  const data = Buffer.from(JSON.stringify({ digest: digestOf(payload), expiresAt })).toString('base64url');
  return { token: `${data}.${signature(data, c.apiKey, c.mode || 'test')}`, expiresAt };
}

export async function sendApprovedTest(input: TestEmailInput, token: string, c: TestDeliveryConfig, request: typeof fetch = fetch, now = Date.now()): Promise<TestDeliveryResult> {
  const payload = payloadFor(input, c);
  if (typeof token !== 'string' || token.length > 1000) throw new Error('Approve this email before sending.');
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Approve this email before sending.');
  const [data, sig] = parts;
  const expected = Buffer.from(signature(data, c.apiKey, c.mode || 'test'));
  const actual = Buffer.from(sig);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Approval is invalid. Review and approve again.');
  let approval: { digest: string; expiresAt: number };
  try { approval = JSON.parse(Buffer.from(data, 'base64url').toString()); }
  catch { throw new Error('Approval is invalid. Review and approve again.'); }
  const digest = digestOf(payload);
  if (approval.digest !== digest || !Number.isFinite(approval.expiresAt) || approval.expiresAt <= now || approval.expiresAt > now + ttl) throw new Error('The email changed or approval expired. Review and approve again.');
  try {
    const response = await request('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `outreach-${c.mode || 'test'}/${digest}` },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return { state: response.status >= 500 ? 'unknown' : 'failed', error: response.status >= 500 ? 'Resend could not confirm acceptance. Retrying this approved email uses the same duplicate-prevention key.' : `Resend rejected the email (HTTP ${response.status}). Check the verified sender and account configuration.` };
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || !('id' in result) || typeof result.id !== 'string' || !result.id) return { state: 'unknown', error: 'Resend returned no message ID. Acceptance is unconfirmed; retrying this approval uses the same key.' };
    return { state: 'accepted', id: result.id };
  } catch { return { state: 'unknown', error: 'The connection ended before acceptance was confirmed. Retry this approved email to check the same request without duplicating it.' }; }
}

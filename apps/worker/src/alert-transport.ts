export type Senders = {
  email: (to: string, subject: string, text: string, idempotencyKey?: string) => Promise<void>;
  slack: (webhookUrl: string, text: string) => Promise<void>;
};

export class DeliveryError extends Error {
  permanent: boolean;
  constructor(message: string, permanent = false) { super(message); this.permanent = permanent; }
}

export const defaultSenders: Senders = {
  async email(to, subject, text, idempotencyKey) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new DeliveryError('Email sending is not configured.');
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
      body: JSON.stringify({ from: process.env.ALERTS_FROM ?? 'StoreCare HQ <alerts@storecarehq.com>', to: [to], subject, text }),
    });
    if (!res.ok) throw new DeliveryError(`Email provider returned HTTP ${res.status}.`, res.status === 400 || res.status === 422);
  },
  async slack(webhookUrl, text) {
    // Do not follow redirects with a message or allow arbitrary destinations.
    const u = new URL(webhookUrl);
    if (u.protocol !== 'https:' || !['hooks.slack.com', 'hooks.slack-gov.com'].includes(u.hostname)
      || !u.pathname.startsWith('/services/') || u.username || u.password || u.port) {
      throw new DeliveryError('Slack webhook address is invalid.', true);
    }
    const res = await fetch(u, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    if (!res.ok) throw new DeliveryError(`Slack returned HTTP ${res.status}.`, [400, 403, 404, 410].includes(res.status));
  },
};

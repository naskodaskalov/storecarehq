import { isProductionHost } from './domains.ts';

export const CONTACT_TOPICS = ['General question', 'Technical support', 'Billing', 'Feedback'] as const;
type ContactField = 'name' | 'email' | 'topic' | 'message';
export type ContactErrors = Partial<Record<ContactField, string>>;
type ContactConfig = { apiKey?: string; to?: string; from?: string; send?: typeof fetch; allow: (key: string) => boolean; clientKey: string };
const MAX_BODY_BYTES = 16_384;
const emailPattern = /^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;

export function contactLimiter(now: () => number = Date.now) {
    const attempts = new Map<string, { count: number; expires: number }>();
    return (key: string) => {
        const time = now();
        for (const [address, entry] of attempts) if (entry.expires <= time) attempts.delete(address);
        const entry = attempts.get(key);
        if (entry) {
            if (entry.count >= 5) return false;
            entry.count += 1;
        } else {
            if (attempts.size >= 10_000) return false;
            attempts.set(key, { count: 1, expires: time + 10 * 60_000 });
        }
        return true;
    };
}

function reply(status: number, body: { ok?: boolean; error?: string; errors?: ContactErrors }) {
    return Response.json(body, { status, headers: { 'cache-control': 'no-store', ...(status === 429 ? { 'retry-after': '600' } : {}) } });
}

export async function handleContact(request: Request, config: ContactConfig): Promise<Response> {
    const origin = request.headers.get('origin');
    const url = new URL(request.url);
    const host = request.headers.get('host') ?? url.host;
    const expectedOrigin = `${isProductionHost(host) ? 'https:' : url.protocol}//${host}`;
    if (!origin || origin !== expectedOrigin) return reply(403, { error: 'Please send your message from the StoreCare website or app.' });
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return reply(415, { error: 'This request format is not supported.' });
    if (!config.allow(config.clientKey)) return reply(429, { error: 'Too many attempts. Please wait ten minutes before trying again.' });

    let input: Record<string, unknown>;
    try {
        const reader = request.body?.getReader();
        if (!reader) return reply(400, { error: 'Please complete the contact form.' });
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_BODY_BYTES) {
                await reader.cancel();
                return reply(413, { error: 'Your message is too long. Please shorten it and try again.' });
            }
            chunks.push(value);
        }
        const body = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
        const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return reply(400, { error: 'Please complete the contact form.' });
        input = parsed as Record<string, unknown>;
    } catch {
        return reply(400, { error: 'The form could not be read. Please try again.' });
    }

    if (typeof input.website === 'string' && input.website.trim()) return reply(200, { ok: true });
    const field = (name: string) => typeof input[name] === 'string' ? input[name].trim() : '';
    const name = field('name');
    const email = field('email');
    const topic = field('topic');
    const message = field('message');
    const source = input.source === 'app' ? 'App' : 'Website';
    const errors: ContactErrors = {};
    if (!name || name.length > 100 || /[\r\n]/.test(name)) errors.name = 'Enter your name, up to 100 characters.';
    if (email.length > 254 || !emailPattern.test(email)) errors.email = 'Enter a valid email address.';
    if (!CONTACT_TOPICS.some(option => option === topic)) errors.topic = 'Choose a topic from the list.';
    if (message.length < 20 || message.length > 5000) errors.message = 'Write between 20 and 5,000 characters.';
    if (Object.keys(errors).length) return reply(400, { error: 'Please check the highlighted fields.', errors });

    if (!config.apiKey || !config.to || !emailPattern.test(config.to) || !config.from || /[\r\n]/.test(config.from)) {
        return reply(503, { error: 'Contact messaging is temporarily unavailable. Please try again later.' });
    }
    try {
        const response = await (config.send ?? fetch)('https://api.resend.com/emails', {
            method: 'POST',
            signal: AbortSignal.timeout(15_000),
            headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
            body: JSON.stringify({
                from: config.from,
                to: [config.to],
                reply_to: email,
                subject: `StoreCare contact: ${topic}`,
                text: `Name: ${name}\nEmail: ${email}\nTopic: ${topic}\nSubmitted from: ${source}\n\n${message}`,
            }),
        });
        if (!response.ok) return reply(502, { error: 'Your message could not be sent. Please try again later.' });
    } catch {
        return reply(502, { error: 'We could not confirm delivery. Your message may have arrived; please wait before trying again.' });
    }
    return reply(200, { ok: true });
}
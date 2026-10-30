import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contactLimiter, handleContact } from './contact.ts';

const valid = { name: 'Agency owner', email: 'owner@example.com', topic: 'Technical support', message: 'Please help me with monitoring my client stores.', website: '', source: 'app' };
function request(body: unknown = valid, origin = 'https://www.storecarehq.com') {
    return new Request('https://www.storecarehq.com/api/contact', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
function setup(overrides: Record<string, unknown> = {}) {
    const calls: RequestInit[] = [];
    const config = {
        apiKey: 'test-key', to: 'support@example.com', from: 'StoreCare <contact@example.com>', allow: () => true, clientKey: 'test',
        send: (async (_url, init) => { calls.push(init!); return new Response('{}', { status: 200 }); }) as typeof fetch,
        ...overrides,
    };
    return { calls, config };
}

test('contact sends plain text to the configured inbox, with the visitor as reply-to only', async () => {
    const { config, calls } = setup();
    const response = await handleContact(request({ ...valid, to: 'attacker@example.com' }), config);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(calls.length, 1);
    const email = JSON.parse(String(calls[0].body));
    assert.deepEqual(email.to, ['support@example.com']);
    assert.equal(email.from, 'StoreCare <contact@example.com>');
    assert.equal(email.reply_to, valid.email);
    assert.match(email.text, /Submitted from: App/);
    assert.equal(email.html, undefined);
});

test('invalid fields and header injection never reach the provider', async () => {
    const { config, calls } = setup();
    const response = await handleContact(request({ name: 'Name\r\nBcc: other@example.com', email: 'bad\n@example.com', topic: 'Injected', message: 'short' }), config);
    assert.equal(response.status, 400);
    assert.deepEqual(Object.keys((await response.json()).errors).sort(), ['email', 'message', 'name', 'topic']);
    assert.equal(calls.length, 0);
});

test('cross-origin submissions and missing origins are rejected', async () => {
    const { config, calls } = setup();
    assert.equal((await handleContact(request(valid, 'https://evil.example'), config)).status, 403);
    const missing = request();
    missing.headers.delete('origin');
    assert.equal((await handleContact(missing, config)).status, 403);
    assert.equal(calls.length, 0);
});

test('honeypot submissions are discarded without sending email', async () => {
    const { config, calls } = setup();
    assert.equal((await handleContact(request({ ...valid, website: 'spam.example' }), config)).status, 200);
    assert.equal(calls.length, 0);
});

test('production origins are checked against the public host behind an HTTP proxy', async () => {
    for (const host of ['www.storecarehq.com', 'app.storecarehq.com']) {
        const { config, calls } = setup();
        const proxied = (origin: string) => new Request('http://localhost:3000/api/contact', {
            method: 'POST', headers: { host, origin, 'content-type': 'application/json' }, body: JSON.stringify(valid),
        });
        assert.equal((await handleContact(proxied(`https://${host}`), config)).status, 200);
        assert.equal((await handleContact(proxied(`http://${host}`), config)).status, 403);
        assert.equal((await handleContact(proxied('https://evil.example'), config)).status, 403);
        assert.equal(calls.length, 1);
    }
});

test('missing configuration and provider rejection do not claim delivery', async () => {
    const missing = setup({ to: undefined });
    assert.equal((await handleContact(request(), missing.config)).status, 503);
    assert.equal(missing.calls.length, 0);
    const rejected = setup({ send: async () => new Response('private provider details', { status: 401 }) });
    const response = await handleContact(request(), rejected.config);
    assert.equal(response.status, 502);
    assert.ok(!(await response.text()).includes('private provider details'));
});

test('network failures report uncertain delivery without exposing internals', async () => {
    const { config } = setup({ send: async () => { throw new Error('secret'); } });
    const response = await handleContact(request(), config);
    assert.equal(response.status, 502);
    const body = await response.text();
    assert.match(body, /may have arrived/);
    assert.ok(!body.includes('secret'));
});

test('large and malformed bodies are rejected', async () => {
    const { config, calls } = setup();
    assert.equal((await handleContact(request({ ...valid, message: 'a'.repeat(20_000) }), config)).status, 413);
    assert.equal((await handleContact(request(null), config)).status, 400);
    const malformed = new Request(request().url, { method: 'POST', headers: request().headers, body: '{broken' });
    assert.equal((await handleContact(malformed, config)).status, 400);
    const wrongType = request();
    wrongType.headers.set('content-type', 'text/plain');
    assert.equal((await handleContact(wrongType, config)).status, 415);
    assert.equal(calls.length, 0);
});

test('rate limiting blocks repeated attempts and expires after ten minutes', async () => {
    let time = 0;
    const allow = contactLimiter(() => time);
    for (let attempt = 0; attempt < 5; attempt++) assert.equal(allow('one'), true);
    assert.equal(allow('one'), false);
    assert.equal(allow('two'), true);
    const { config, calls } = setup({ allow, clientKey: 'one' });
    const response = await handleContact(request(), config);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '600');
    assert.equal(calls.length, 0);
    time = 600_000;
    assert.equal(allow('one'), true);
});
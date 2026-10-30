import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { APP_ORIGIN, WEBSITE_ORIGIN, appLink, websiteLink, hostRouting, sessionRouting, authCallbackUrl, isPublicPath } from './domains.ts';

test('production website is always marketing; application links use the app host', () => {
  for (const host of ['storecarehq.com', 'www.storecarehq.com']) {
    assert.deepEqual(hostRouting(host, '/'), { kind: 'rewrite', url: `${WEBSITE_ORIGIN}/welcome` });
    assert.equal(appLink(host, '/login?trial=1'), `${APP_ORIGIN}/login?trial=1`);
  }
  assert.equal(websiteLink('app.storecarehq.com'), WEBSITE_ORIGIN);
  assert.deepEqual(hostRouting('app.storecarehq.com', '/welcome'), { kind: 'redirect', url: `${WEBSITE_ORIGIN}/` });
});

test('direct app entry validates session, with protected routes requiring authentication', () => {
  assert.equal(hostRouting('app.storecarehq.com', '/'), null);
  assert.equal(sessionRouting('app.storecarehq.com', '/', true), null);
  assert.deepEqual(sessionRouting('app.storecarehq.com', '/', false), { kind: 'redirect', path: '/login' });
  assert.equal(sessionRouting('app.storecarehq.com', '/stores/123', true), null);
  assert.deepEqual(sessionRouting('app.storecarehq.com', '/stores/123', false), { kind: 'redirect', path: '/login' });
  for (const path of ['/login', '/auth/forgot-password', '/auth/callback', '/r/client-token', '/api/stripe/webhook']) {
    assert.equal(sessionRouting('app.storecarehq.com', path, false), null);
  }
  assert.equal(isPublicPath('/login-malicious'), false);
  assert.equal(isPublicPath('/authentic'), false);
});

test('legacy app URLs move to app with query intact, without forwarding submitted credentials', () => {
  for (const host of ['www.storecarehq.com', 'storecarehq.com', 'storecarehq.vercel.app']) {
    assert.deepEqual(hostRouting(host, '/login', '?trial=1'), { kind: 'redirect', url: `${APP_ORIGIN}/login?trial=1` });
    assert.deepEqual(hostRouting(host, '/stores/123', '?tab=checks'), { kind: 'redirect', url: `${APP_ORIGIN}/stores/123?tab=checks` });
    assert.deepEqual(hostRouting(host, '/login', '', 'POST'), { kind: 'reject' });
    for (const path of ['/r/client-token', '/auth/callback', '/auth/password', '/api/stripe/webhook']) assert.equal(hostRouting(host, path), null);
  }
  assert.deepEqual(hostRouting('www.storecarehq.com', '/', '', 'POST'), { kind: 'reject' });
  assert.equal(new URL(hostRouting('www.storecarehq.com', '//evil.example/path')!.kind === 'redirect'
    ? (hostRouting('www.storecarehq.com', '//evil.example/path') as { url: string }).url : '').origin, APP_ORIGIN);
});

test('local and preview origins retain their own links and callback cookies', () => {
  for (const host of ['localhost:3101', '127.0.0.1:3101', 'storecarehq-preview.vercel.app']) {
    assert.equal(hostRouting(host, '/'), null);
    assert.equal(appLink(host, '/login'), '/login');
    assert.equal(websiteLink(host), '/welcome');
  }
  assert.deepEqual(sessionRouting('localhost:3101', '/', false), { kind: 'rewrite', path: '/welcome' });
  assert.equal(authCallbackUrl('localhost:3101', 'http://localhost:3101'), 'http://localhost:3101/auth/callback');
  assert.equal(authCallbackUrl('127.0.0.1:3101', 'http://127.0.0.1:3101'), 'http://127.0.0.1:3101/auth/callback');
  assert.equal(authCallbackUrl('storecarehq-preview.vercel.app', APP_ORIGIN, 'storecarehq-preview.vercel.app'), 'https://storecarehq-preview.vercel.app/auth/callback');
});

test('auth callback destinations cannot be supplied through an arbitrary Host header', () => {
  assert.equal(authCallbackUrl('app.storecarehq.com', WEBSITE_ORIGIN), `${APP_ORIGIN}/auth/callback`);
  for (const host of ['evil.example', 'app.storecarehq.com.evil.example', 'unrelated.vercel.app', 'localhost:9999']) {
    assert.throws(() => authCallbackUrl(host, 'http://localhost:3101', 'storecarehq-preview.vercel.app'));
  }
});

test('running production server routes the actual Host header and renders cross-domain links', { skip: !process.env.STORECARE_ROUTING_TEST_ORIGIN }, async () => {
  const origin = process.env.STORECARE_ROUTING_TEST_ORIGIN!;
  // fetch can normalize Host; use HTTP directly to exercise Next's actual incoming host handling.
  const request = (host: string, path: string, method = 'GET') => new Promise<Response>((resolve, reject) => {
    const req = httpRequest(`${origin}${path}`, { headers: { host }, method }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve(new Response(body, { status: res.statusCode, headers: { location: String(res.headers.location ?? '') } })));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('Routing test request timed out')));
    req.end();
  });
  const app = await request('app.storecarehq.com', '/');
  assert.equal(app.status, 307);
  assert.equal(app.headers.get('location'), `${APP_ORIGIN}/login`);
  const website = await request('www.storecarehq.com', '/');
  assert.equal(website.status, 200);
  assert.match(await website.text(), /href="https:\/\/app\.storecarehq\.com\/login\?trial=1"/);
  const legacy = await request('www.storecarehq.com', '/login?trial=1');
  assert.equal(legacy.status, 307);
  assert.equal(legacy.headers.get('location'), `${APP_ORIGIN}/login?trial=1`);
  assert.equal((await request('www.storecarehq.com', '/login', 'POST')).status, 409);
  const login = await request('app.storecarehq.com', '/login');
  assert.equal(login.status, 200);
  assert.match(await login.text(), /href="https:\/\/www\.storecarehq\.com"/);
  const local = await request(new URL(origin).host, '/');
  assert.equal(local.status, 200);
  assert.match(await local.text(), /href="\/login\?trial=1"/);
});

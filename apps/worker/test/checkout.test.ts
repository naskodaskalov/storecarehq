// Runs the real Playwright checkout test against a tiny fake store on localhost.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { chromium, type Browser } from 'playwright';
import { runCheckout, runCheckoutOnce } from '../src/jobs/checkout.ts';
import { freshDb, seedStore } from './helpers.ts';

let cartWorks = true;
let challenge = false;
const seenUserAgents = new Set<string>();

function fakeStore(): Server {
  return createServer((req, res) => {
    seenUserAgents.add(req.headers['user-agent'] ?? '');
    const html = (body: string, status = 200) => {
      res.writeHead(status, { 'content-type': 'text/html' });
      res.end(`<!doctype html><html><head><title>Fake store</title></head><body>${body}</body></html>`);
    };
    if (challenge) return html('<title>Verifying your connection...</title>', 429);
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/') return html('<h1>Home</h1>');
    if (url.pathname === '/products/candle') return html('<h1>Candle</h1>');
    if (url.pathname === '/products/candle.js') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ variants: [{ id: 11, available: false }, { id: 12, available: true }] }));
    }
    if (url.pathname === '/cart/add.js' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const ok = cartWorks && JSON.parse(body).items?.[0]?.id === 12;
        res.writeHead(ok ? 200 : 422, { 'content-type': 'application/json' });
        res.end(JSON.stringify(ok ? { items: [] } : { description: 'Cannot add' }));
      });
      return;
    }
    if (url.pathname === '/checkout') {
      res.writeHead(302, { location: '/checkouts/cn/abc123?locale=en' });
      return res.end();
    }
    if (url.pathname.startsWith('/checkouts/')) return html('<label>Email</label><input name="email">');
    html('not found', 404);
  });
}

describe('checkout test (Playwright)', () => {
  let server: Server;
  let base: string;
  let browser: Browser;

  before(async () => {
    server = fakeStore();
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const addr = server.address();
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
    browser = await chromium.launch();
  });
  after(async () => {
    await browser?.close();
    server?.close();
  });

  test('passes all four steps on mobile and identifies as StoreCareBot', async () => {
    cartWorks = true;
    const r = await runCheckoutOnce(browser, base, 'candle', 'mobile');
    assert.equal(r.result, 'pass', JSON.stringify(r.steps));
    assert.deepEqual(r.steps.map((s) => s.step), ['home', 'product', 'add_to_cart', 'checkout']);
    assert.ok([...seenUserAgents].every((ua) => ua.includes('StoreCareBot')));
  });

  test('reports the failing step when add to cart breaks', async () => {
    cartWorks = false;
    const r = await runCheckoutOnce(browser, base, 'candle', 'desktop');
    assert.equal(r.result, 'fail');
    assert.equal(r.failedStep, 'add_to_cart');
    cartWorks = true;
  });

  test('a bot challenge is "blocked", not "failed"', async () => {
    challenge = true;
    const r = await runCheckoutOnce(browser, base, 'candle', 'desktop');
    challenge = false;
    assert.equal(r.result, 'blocked');
  });

  test('with the database: no consent means no test; failure opens an incident, pass resolves it', { skip: !process.env.TEST_DATABASE_URL && 'TEST_DATABASE_URL not set' }, async () => {
    const db = await freshDb();
    try {
      const noConsent = await seedStore(db!.pool, { public_url: base, checkout_product_handle: 'candle' });
      assert.deepEqual(await runCheckout(db!.pool, noConsent, browser), { skipped: 'no consent recorded' });

      const store = await seedStore(db!.pool, {
        public_url: base,
        checkout_product_handle: 'candle',
        checkout_consent_at: new Date(),
        checkout_desktop: false,
      });
      cartWorks = false;
      const failed = await runCheckout(db!.pool, store, browser);
      assert.ok('opened' in failed && failed.opened);
      cartWorks = true;
      await runCheckout(db!.pool, store, browser);
      const { rows } = await db!.pool.query(`select resolved_at from public.incidents where store_id = $1`, [store.id]);
      assert.equal(rows.length, 1);
      assert.ok(rows[0].resolved_at);
      const runs = await db!.pool.query(`select result from public.checkout_runs where store_id = $1 order by ran_at`, [store.id]);
      assert.deepEqual(runs.rows.map((r) => r.result), ['fail', 'pass']);
    } finally {
      await db!.drop();
    }
  });
});

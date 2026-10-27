// Daily checkout test: home → product → add to cart → checkout page loads.
// Runs only for stores whose agency confirmed it manages the store and the client agreed (checkout_consent_at).
// Never types into the checkout, so no customer details, abandoned-checkout email or order is created.

import { chromium, type Browser, type Page } from 'playwright';
import { looksBlocked, USER_AGENT } from '@storecare/storefront';
import type { Db, StoreRow } from '../db.ts';

export type Device = 'mobile' | 'desktop';
export type StepName = 'home' | 'product' | 'add_to_cart' | 'checkout';
export type Step = { step: StepName; ok: boolean; ms: number; detail?: string; screenshot?: string };
export type CheckoutResult = { device: Device; result: 'pass' | 'fail' | 'blocked'; failedStep: StepName | null; detail: string | null; steps: Step[] };

const VIEWPORTS: Record<Device, { width: number; height: number; isMobile: boolean; hasTouch: boolean }> = {
  mobile: { width: 390, height: 844, isMobile: true, hasTouch: true },
  desktop: { width: 1366, height: 900, isMobile: false, hasTouch: false },
};

async function pageBlocked(page: Page, status: number | undefined): Promise<boolean> {
  return looksBlocked(status ?? 200, await page.content());
}

export async function runCheckoutOnce(
  browser: Browser,
  baseUrl: string,
  handle: string,
  device: Device,
  opts: { screenshotDir?: string; timeoutMs?: number } = {},
): Promise<CheckoutResult> {
  const vp = VIEWPORTS[device];
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(opts.timeoutMs ?? 30000);
  const steps: Step[] = [];

  const shot = async (name: StepName) => {
    if (!opts.screenshotDir) return undefined;
    const path = `${opts.screenshotDir}/${device}-${name}.png`;
    await page.screenshot({ path, fullPage: false }).catch(() => undefined);
    return path;
  };

  const run = async (name: StepName, fn: () => Promise<string | void>): Promise<'ok' | 'fail' | 'blocked'> => {
    const started = Date.now();
    try {
      const detail = await fn();
      steps.push({ step: name, ok: true, ms: Date.now() - started, detail: detail || undefined, screenshot: await shot(name) });
      return 'ok';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const blocked = msg.startsWith('BLOCKED');
      steps.push({ step: name, ok: false, ms: Date.now() - started, detail: msg.slice(0, 300), screenshot: await shot(name) });
      return blocked ? 'blocked' : 'fail';
    }
  };

  const finish = async (result: CheckoutResult['result']): Promise<CheckoutResult> => {
    await context.close();
    const failed = steps.find((s) => !s.ok);
    return { device, result, failedStep: failed?.step ?? null, detail: failed?.detail ?? null, steps };
  };

  const goto = async (url: string) => {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded' });
    if (await pageBlocked(page, res?.status())) throw new Error(`BLOCKED ${res?.status() ?? ''} bot challenge`);
    if (!res || res.status() >= 400) throw new Error(`HTTP ${res?.status() ?? 'no response'}`);
    return res;
  };

  let variantId: number | null = null;
  const order: [StepName, () => Promise<string | void>][] = [
    ['home', async () => void (await goto(`${baseUrl}/`))],
    [
      'product',
      async () => {
        await goto(`${baseUrl}/products/${handle}`);
        const product = await page.evaluate(async (h) => {
          const r = await fetch(`/products/${h}.js`, { headers: { accept: 'application/json' } });
          return r.ok ? ((await r.json()) as { variants: { id: number; available: boolean }[] }) : null;
        }, handle);
        const v = product?.variants.find((x) => x.available);
        if (!v) throw new Error('no available variant');
        variantId = v.id;
        return `variant ${v.id}`;
      },
    ],
    [
      'add_to_cart',
      async () => {
        const status = await page.evaluate(async (id) => {
          const r = await fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: JSON.stringify({ items: [{ id, quantity: 1 }] }),
          });
          return r.status;
        }, variantId);
        if (status !== 200) throw new Error(`cart/add.js returned ${status}`);
      },
    ],
    [
      'checkout',
      async () => {
        await goto(`${baseUrl}/checkout`);
        const url = page.url();
        if (!/\/checkouts?\//.test(url)) throw new Error(`did not reach checkout (at ${url})`);
        // Stop here: the checkout page rendered. Nothing is typed into it.
        return url.replace(/\?.*$/, '');
      },
    ],
  ];

  for (const [name, fn] of order) {
    const r = await run(name, fn);
    if (r !== 'ok') return finish(r === 'blocked' ? 'blocked' : 'fail');
  }
  return finish('pass');
}

/** Picks the product to test: the agency's choice, else the first product in the latest snapshot. */
export async function testHandle(db: Db, store: StoreRow): Promise<string | null> {
  if (store.checkout_product_handle) return store.checkout_product_handle;
  const { rows } = await db.query<{ handle: string }>(
    `select p->>'handle' as handle
       from public.storefront_snapshots s, jsonb_array_elements(s.products) p
      where s.store_id = $1 and s.products is not null
      order by s.taken_at desc limit 1`,
    [store.id],
  );
  return rows[0]?.handle ?? null;
}

export async function runCheckout(db: Db, store: StoreRow, browser?: Browser) {
  if (!store.checkout_consent_at) return { skipped: 'no consent recorded' as const };
  const handle = await testHandle(db, store);
  if (!handle) return { skipped: 'no product to test' as const };

  const own = !browser;
  const b = browser ?? (await chromium.launch());
  const devices: Device[] = [...(store.checkout_mobile ? ['mobile' as const] : []), ...(store.checkout_desktop ? ['desktop' as const] : [])];
  const results: CheckoutResult[] = [];
  try {
    for (const d of devices) {
      const r = await runCheckoutOnce(b, store.public_url, handle, d);
      results.push(r);
      await db.query(
        `insert into public.checkout_runs (store_id, agency_id, device, result, failed_step, detail, steps)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [store.id, store.agency_id, d, r.result, r.failedStep, r.detail, JSON.stringify(r.steps.map(({ screenshot, ...s }) => s))],
      );
    }
  } finally {
    if (own) await b.close();
  }

  const failed = results.filter((r) => r.result === 'fail');
  let opened: string | null = null;
  if (failed.length) {
    const cause = failed.map((r) => `${r.device}: ${r.failedStep} — ${r.detail}`).join('; ');
    const ins = await db.query<{ id: string }>(
      `insert into public.incidents (store_id, agency_id, kind, cause) values ($1, $2, 'checkout', $3)
       on conflict (store_id, kind) where resolved_at is null do nothing returning id`,
      [store.id, store.agency_id, cause],
    );
    opened = ins.rows[0]?.id ?? null;
  } else if (results.length && results.every((r) => r.result === 'pass')) {
    await db.query(
      `update public.incidents set resolved_at = now() where store_id = $1 and kind = 'checkout' and resolved_at is null`,
      [store.id],
    );
  }
  return { results, opened };
}

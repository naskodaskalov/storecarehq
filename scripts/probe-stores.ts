// Phase 1 validation: can we see what we need from the public storefront?
//
//   node scripts/probe-stores.ts store1.com store2.com
//   node scripts/probe-stores.ts --file scripts/stores.txt --out probe-results.json
//
// Runs up to 4 stores at a time, one request per second per store, as StoreCareBot.

import { readFileSync, writeFileSync } from 'node:fs';
import { probeStore, type ProbeResult } from '../packages/storefront/src/index.ts';

const args = process.argv.slice(2);
let out = 'probe-results.json';
const stores: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file') {
    stores.push(
      ...readFileSync(args[++i], 'utf8')
        .split(/\r?\n/)
        .map((l) => l.replace(/#.*/, '').trim())
        .filter(Boolean),
    );
  } else if (args[i] === '--out') {
    out = args[++i];
  } else {
    stores.push(args[i]);
  }
}
if (!stores.length) {
  console.error('Usage: node scripts/probe-stores.ts [--file stores.txt] [--out results.json] store.com ...');
  process.exit(1);
}

const results: ProbeResult[] = [];
const queue = [...stores];
await Promise.all(
  Array.from({ length: Math.min(4, queue.length) }, async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      process.stderr.write(`checking ${s}\n`);
      results.push(await probeStore(s, { maxProductPages: 4 }));
    }
  }),
);
results.sort((a, b) => stores.indexOf(a.input) - stores.indexOf(b.input));

const yes = (b: boolean) => (b ? 'yes' : 'NO');
const feed = (r: ProbeResult) =>
  r.productFeed.status === 'ok'
    ? `ok ${r.productFeed.products.length}${r.productFeed.truncated ? '+' : ''}`
    : r.productFeed.status === 'skipped'
      ? 'robots'
      : `${r.productFeed.status} ${r.productFeed.httpStatus}`;

const rows = results.map((r) => ({
  store: r.baseUrl.replace('https://', ''),
  home: r.home.blocked ? `blocked ${r.home.status}` : String(r.home.status || r.home.error),
  shopify: yes(r.isShopify),
  theme: r.theme ? `${r.theme.name ?? '?'} (${r.theme.schemaName ?? '?'} ${r.theme.schemaVersion ?? ''})`.trim() : '-',
  products: feed(r),
  apps: String(r.apps.length),
  known: String(r.apps.filter((a) => a.known).length),
  cart: 'status' in r.cartJs && typeof r.cartJs.status === 'number' ? String(r.cartJs.status) : 'robots',
}));
console.table(rows);

const n = results.length;
const count = (f: (r: ProbeResult) => boolean) => `${results.filter(f).length}/${n}`;
console.log(`Home page readable:      ${count((r) => r.home.status === 200 && !r.home.blocked)}`);
console.log(`Theme ID visible:        ${count((r) => r.theme?.id != null)}`);
console.log(`Theme version visible:   ${count((r) => !!r.theme?.schemaVersion)}`);
console.log(`products.json readable:  ${count((r) => r.productFeed.status === 'ok')}`);
console.log(`Apps detected (any):     ${count((r) => r.apps.length > 0)}`);

writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`\nFull results: ${out}`);

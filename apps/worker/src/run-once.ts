// Run one job for one store without the queue, for development:
//   node src/run-once.ts storefront <store-id>
import { createPool } from './db.ts';
import { checkoutTask, siteTask, speedTask, storefrontTask, uptimeTask } from './tasks.ts';

const tasks = { storefront: storefrontTask, uptime: uptimeTask, checkout: checkoutTask, speed: speedTask, site: siteTask };
const [name, storeId] = process.argv.slice(2) as [keyof typeof tasks, string];
if (!tasks[name] || !storeId) {
  console.error(`Usage: node src/run-once.ts <${Object.keys(tasks).join('|')}> <store-id>`);
  process.exit(1);
}
const pool = createPool();
await tasks[name](pool, storeId);
await pool.end();
console.log(`${name} done for ${storeId}`);

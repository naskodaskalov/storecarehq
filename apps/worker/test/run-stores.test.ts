import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runStores } from '../src/run-stores.ts';

test('a schedule lookup failure does not prevent other stores, including queued stores, from running', async () => {
  const stores = Array.from({ length: 7 }, (_, i) => ({ name: `store-${i}` }));
  const visited: string[] = [];
  const logs: string[] = [];
  const lines = await runStores(stores, async (store) => {
    visited.push(store.name);
    if (store.name === 'store-0') throw new Error('connection string contains a secret');
    return `${store.name}: uptime ok`;
  }, (line) => logs.push(line));
  assert.equal(new Set(visited).size, 7);
  assert.equal(lines.length, 7);
  assert.equal(lines.filter((line) => line.includes('FAILED')).length, 1);
  assert.equal(logs.length, 7);
  assert.ok(logs.every((line) => !line.includes('secret')));
});

test('logs completed stores without waiting for the slowest store', async () => {
  let release!: () => void;
  const slow = new Promise<void>((resolve) => { release = resolve; });
  const logs: string[] = [];
  const running = runStores([{ name: 'slow' }, { name: 'fast' }], async (store) => {
    if (store.name === 'slow') await slow;
    return store.name;
  }, (line) => logs.push(line));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(logs, ['fast']);
  release();
  await running;
  assert.deepEqual(logs, ['fast', 'slow']);
});

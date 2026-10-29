/** Isolate failures even before a store's jobs start (for example, reading its schedule). */
export async function runStores<T extends { name: string }>(
  stores: T[],
  run: (store: T) => Promise<string>,
  log: (line: string) => void = console.log,
): Promise<string[]> {
  const queue = [...stores];
  const lines: string[] = [];
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    for (let store = queue.shift(); store; store = queue.shift()) {
      let line: string;
      try {
        line = await run(store);
      } catch {
        // Connection errors can contain credentials: keep the diagnostic safe for Actions logs.
        line = `${store.name}: FAILED to read schedule or run checks; verify database connectivity and migrations`;
      }
      lines.push(line);
      log(line);
    }
  }));
  return lines;
}

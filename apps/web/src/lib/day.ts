// Calendar days and clock labels in a given time zone. No imports, so client components can use it.

/** YYYY-MM-DD of an instant in a time zone. */
export function dayKey(iso: string | Date, timeZone: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
}

/** "Today 06:02", "Yesterday 18:47" or "28 Oct 09:14" in a time zone. */
export function whenLabel(iso: string, now: Date, timeZone: string): string {
  const day = dayKey(iso, timeZone);
  const time = new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone });
  const date =
    day === dayKey(now, timeZone)
      ? 'Today'
      : day === dayKey(new Date(now.getTime() - 864e5), timeZone)
        ? 'Yesterday'
        : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone });
  return `${date} ${time}`;
}

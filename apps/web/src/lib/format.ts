export const hours = (minutes: number) => (Math.round((minutes / 60) * 10) / 10).toFixed(1);

export function when(iso: string, tz?: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: tz });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  return { date, time };
}

export function healthLabel(score: number | null): { text: string; tone: 'good' | 'fair' | 'risk' | 'none' } {
  if (score === null) return { text: 'Waiting for first checks', tone: 'none' };
  if (score >= 90) return { text: `${score} · Good`, tone: 'good' };
  if (score >= 75) return { text: `${score} · Fair`, tone: 'fair' };
  return { text: `${score} · At risk`, tone: 'risk' };
}

export const LIMITED_REASONS: Record<string, string> = {
  blocked: 'The store shows bot checks a verification page, so we only track uptime and speed.',
  headless: 'This store uses a custom frontend, so theme and app changes are not visible.',
  no_product_feed: 'The store hides its product feed, so product and price changes are not tracked.',
};

export const monthStartLabel = (d = new Date()) => d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

export const host =(url: string) => url.replace(/^https?:\/\//, '');

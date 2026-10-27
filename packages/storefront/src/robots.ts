// Minimal robots.txt reader: the groups for our bot, falling back to "*".
// Supports Allow/Disallow with "*" wildcards and "$" end anchors; longest match wins.

type Rule = { allow: boolean; pattern: string };

export type Robots = { rules: Rule[]; crawlDelay?: number };

export function parseRobots(text: string, agent = 'storecarebot'): Robots {
  const groups: { agents: string[]; rules: Rule[]; crawlDelay?: number }[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'allow' || key === 'disallow') {
      if (value === '' && key === 'disallow') continue; // "Disallow:" = allow all
      current.rules.push({ allow: key === 'allow', pattern: value });
    } else if (key === 'crawl-delay') {
      const n = Number(value);
      if (Number.isFinite(n)) current.crawlDelay = n;
    }
  }

  const mine = groups.filter((g) => g.agents.some((a) => a !== '*' && agent.includes(a)));
  const chosen = mine.length ? mine : groups.filter((g) => g.agents.includes('*'));
  return {
    rules: chosen.flatMap((g) => g.rules),
    crawlDelay: chosen.find((g) => g.crawlDelay !== undefined)?.crawlDelay,
  };
}

function toRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp('^' + body + (anchored ? '$' : ''));
}

/** path includes the query string, e.g. "/products.json?limit=250". */
export function isAllowed(robots: Robots, path: string): boolean {
  let best: Rule | null = null;
  for (const rule of robots.rules) {
    if (!toRegex(rule.pattern).test(path)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}

// Does a work-log entry explain a detected change? Used by the worker (new change) and the web app (new entry).

const MATCH_WORDS: Record<string, RegExp> = {
  theme_published: /theme|publish|redesign|homepage|template/i,
  theme_updated: /theme|update|upgrade/i,
  app_added: /\bapps?\b|install|integration/i,
  app_removed: /\bapps?\b|uninstall|remove|clean/i,
  products_added: /product|launch|collection|upload/i,
  products_removed: /product|archive|remove|unpublish/i,
  prices_changed: /price|sale|discount|promo/i,
};

export function workEntryExplains(change: { kind: string; summary: string }, entryText: string): boolean {
  const re = MATCH_WORDS[change.kind];
  if (re?.test(entryText)) return true;
  const app = change.summary.match(/^(.+) (added|removed)$/)?.[1];
  return !!app && entryText.toLowerCase().includes(app.toLowerCase());
}

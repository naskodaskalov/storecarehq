// Reads what a Shopify storefront page reveals: the live theme and the scripts apps add.

export type ThemeInfo = {
  id: number | null;
  name: string | null;
  schemaName: string | null;
  schemaVersion: string | null;
  themeStoreId: number | null;
  role: string | null;
};

export type ScriptRef = {
  url: string;
  /** Where we saw it: a <script src>, Shopify's asyncLoad list (script tags API), or a theme app extension asset. */
  via: 'script' | 'asyncLoad' | 'extension';
};

export type DetectedApp = {
  /** Stable key used for diffing day to day. */
  key: string;
  name: string;
  known: boolean;
  evidence: string[];
};

export function isShopifyPage(html: string, headers: Record<string, string> = {}): boolean {
  if (headers['x-shopid'] || headers['x-shopify-stage'] || /shopify/i.test(headers['powered-by'] ?? '')) {
    return true;
  }
  return /Shopify\.shop\s*=|cdn\.shopify\.com|\/cdn\/shop\//.test(html);
}

export function parseTheme(html: string): ThemeInfo | null {
  const m = html.match(/Shopify\.theme\s*=\s*(\{[^;]*?\})\s*;/);
  if (!m) return null;
  try {
    const t = JSON.parse(m[1]) as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === 'number' ? v : v == null ? null : Number(v) || null);
    const str = (v: unknown) => (typeof v === 'string' ? v : null);
    return {
      id: num(t.id),
      name: str(t.name),
      schemaName: str(t.schema_name),
      schemaVersion: str(t.schema_version),
      themeStoreId: num(t.theme_store_id),
      role: str(t.role),
    };
  } catch {
    return null;
  }
}

function absolutize(src: string, base: string): string | null {
  try {
    return new URL(src.replace(/&amp;/g, '&'), base).toString();
  } catch {
    return null;
  }
}

export function parseScripts(html: string, baseUrl: string): ScriptRef[] {
  const out = new Map<string, ScriptRef>();

  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const url = absolutize(m[1], baseUrl);
    if (url) out.set(url, { url, via: /\/extensions\/[0-9a-f-]{8,}\//i.test(url) ? 'extension' : 'script' });
  }

  // Script tags added through the Admin API are loaded by Shopify's asyncLoad: var urls = ["https:\/\/..."]
  for (const m of html.matchAll(/var\s+urls\s*=\s*(\[[^\]]*\])/g)) {
    try {
      const list = JSON.parse(m[1]) as unknown[];
      for (const u of list) {
        if (typeof u !== 'string') continue;
        const url = absolutize(u, baseUrl);
        if (url) out.set(url, { url, via: 'asyncLoad' });
      }
    } catch {
      /* ignore malformed */
    }
  }

  // Theme app extensions also add CSS and preload links; their asset paths identify the extension.
  for (const m of html.matchAll(/["'](\/\/cdn\.shopify\.com\/extensions\/[^"']+|https:\/\/cdn\.shopify\.com\/extensions\/[^"']+)["']/g)) {
    const url = absolutize(m[1], baseUrl);
    if (url && !out.has(url)) out.set(url, { url, via: 'extension' });
  }

  return [...out.values()];
}

// Well-known app and tracking domains. Unknown third-party hosts still become apps keyed by host.
const KNOWN: { name: string; match: RegExp }[] = [
  { name: 'Klaviyo', match: /klaviyo\.com/ },
  { name: 'Judge.me', match: /judge\.me|judgeme/ },
  { name: 'Yotpo', match: /yotpo\.com/ },
  { name: 'Okendo', match: /okendo\.io/ },
  { name: 'Loox', match: /loox\.io/ },
  { name: 'Stamped', match: /stamped\.io/ },
  { name: 'Gorgias', match: /gorgias\.(chat|io)/ },
  { name: 'Recharge', match: /rechargecdn|rechargeapps|rechargepayments/ },
  { name: 'Smile.io', match: /smile\.io|sweettooth\.io/ },
  { name: 'Rebuy', match: /rebuyengine\.com/ },
  { name: 'Privy', match: /privy\.com/ },
  { name: 'Attentive', match: /attn\.tv|attentivemobile/ },
  { name: 'Postscript', match: /postscript\.io/ },
  { name: 'Searchanise', match: /searchanise/ },
  { name: 'Boost Commerce', match: /boostcommerce|bc-solutions/ },
  { name: 'Shogun', match: /getshogun|shogun/ },
  { name: 'PageFly', match: /pagefly/ },
  { name: 'GemPages', match: /gempages/ },
  { name: 'Bold', match: /boldapps|boldcommerce/ },
  { name: 'Tidio', match: /tidio/ },
  { name: 'Zendesk', match: /zdassets\.com|zendesk/ },
  { name: 'Intercom', match: /intercom(cdn)?\.io/ },
  { name: 'Hotjar', match: /hotjar\.com/ },
  { name: 'Lucky Orange', match: /luckyorange/ },
  { name: 'Microsoft Clarity', match: /clarity\.ms/ },
  { name: 'Google Tag Manager', match: /googletagmanager\.com/ },
  { name: 'Meta Pixel', match: /connect\.facebook\.net/ },
  { name: 'TikTok Pixel', match: /analytics\.tiktok\.com/ },
  { name: 'Pinterest Tag', match: /pinimg\.com|ct\.pinterest\.com/ },
  { name: 'Elevar', match: /getelevar/ },
  { name: 'Triple Whale', match: /triplewhale|triplepixel/ },
  { name: 'Afterpay', match: /afterpay/ },
  { name: 'Klarna', match: /klarna/ },
  { name: 'OneTrust', match: /onetrust|cookielaw\.org/ },
  { name: 'Cookiebot', match: /cookiebot/ },
  { name: 'Global-e', match: /global-e\.com/ },
  { name: 'Nosto', match: /nosto\.com/ },
  { name: 'Algolia', match: /algolia/ },
  { name: 'NoFraud', match: /nofraud\.com/ },
  { name: 'Signifyd', match: /signifyd\.com/ },
  { name: 'Intelligems', match: /intelligems\.io/ },
  { name: 'Trustpilot', match: /trustpilot\.com/ },
  { name: 'Swym Wishlist', match: /swymv3|swym/ },
  { name: 'Skio', match: /skio\.com/ },
  { name: 'Ordergroove', match: /ordergroove\.com/ },
  { name: 'Rise.ai', match: /rise-ai\.com/ },
  { name: 'Redo', match: /getredo\.com/ },
  { name: 'Kiwi Sizing', match: /kiwisizing\.com/ },
  { name: 'AB Tasty', match: /abtasty\.com/ },
  { name: 'Dynamic Yield', match: /dynamicyield\.com/ },
  { name: 'Snapchat Pixel', match: /snapchat\.com/ },
  { name: 'Rakuten Advertising', match: /rakuten/ },
  { name: 'Usercentrics', match: /usercentrics\.eu/ },
  { name: 'Ada', match: /ada\.support/ },
  { name: 'Richpanel', match: /richpanel\.com/ },
  { name: 'Fomo', match: /usefomo\.com/ },
  { name: 'POWR', match: /powr\.io/ },
  { name: 'Yottaa', match: /yottaa\.com/ },
  { name: 'Sentry', match: /sentry-cdn\.com/ },
  { name: 'AfterShip', match: /automizely\.com|aftership/ },
  { name: 'Siena AI', match: /siena\.cx/ },
  { name: 'EcoCart', match: /ecocart\.tools/ },
  { name: 'Beam', match: /beamimpact\.com/ },
  { name: 'Videowise', match: /videowise\.com/ },
  { name: 'Back in Stock', match: /useamp\.com/ },
  { name: 'MinMaxify', match: /minmaxify\.com/ },
  { name: 'ShopMy', match: /shopmy\.us/ },
  { name: 'GovX ID', match: /govx\.com/ },
  { name: 'Electric SMS', match: /electricsms\.com/ },
  { name: 'Purple Dot', match: /purpledotprice\.com/ },
  { name: 'DataGrail', match: /datagrail\.io/ },
  { name: 'Glopal', match: /glopal\.com/ },
  { name: 'Fera', match: /fera\.ai/ },
  { name: 'Rivo', match: /rivo/ },
  { name: 'Smile.io', match: /smile-loader/ },
];

/** Public CDNs host scripts for many apps, so a script there is reported by host, not as a named app. */
const GENERIC_CDN = /(^|\.)(cloudfront\.net|jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|ajax\.googleapis\.com|storage\.googleapis\.com|azureedge\.net|b-cdn\.net|digitaloceanspaces\.com|cloudflareinsights\.com|fonts\.net|accounts\.google\.com)$/;

/** "rivo-loyalty-rewards-referrals-832" → { handle: "rivo-loyalty-rewards-referrals", version: "832" }. */
export function parseExtensionSegment(segment: string): { handle: string; version: string | null } | null {
  if (/^\d{4}-\d{2}-\d{2}/.test(segment) || /^\d+(\.\d+)*$/.test(segment)) return null; // a build stamp, not a handle
  const m = segment.match(/^(.*?)-(\d+)$/);
  return m ? { handle: m[1], version: m[2] } : { handle: segment, version: null };
}

const titleCase = (handle: string) =>
  handle
    .split('-')
    .filter(Boolean)
    .map((w) => (w.length <= 3 && /^(sms|gdpr|ai|ab|bnb)$/i.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');

/** Hosts that belong to Shopify or the store itself, not to an app. */
function isPlatform(host: string, storeHost: string): boolean {
  return (
    host === storeHost ||
    host.endsWith('.' + storeHost.replace(/^www\./, '')) ||
    /(^|\.)shopify(cdn|cloud)?\.com$|(^|\.)shopifysvc\.com$|(^|\.)shopify\.(com|io)$|(^|\.)shop\.app$/.test(host)
  );
}

export function detectApps(scripts: ScriptRef[], storeUrl: string): DetectedApp[] {
  const storeHost = new URL(storeUrl).host;
  const apps = new Map<string, DetectedApp>();
  const add = (key: string, name: string, known: boolean, evidence: string) => {
    const a = apps.get(key) ?? { key, name, known, evidence: [] };
    if (!a.evidence.includes(evidence)) a.evidence.push(evidence);
    apps.set(key, a);
  };

  for (const s of scripts) {
    let u: URL;
    try {
      u = new URL(s.url);
    } catch {
      continue;
    }
    const full = u.host + u.pathname;
    const known = KNOWN.find((k) => k.match.test(full));
    if (known) {
      add(known.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), known.name, true, s.url);
      continue;
    }
    // Theme app extension assets: /extensions/<uuid>/<handle>-<version>/assets/<file>.
    // The uuid changes with each release, so the app is keyed by its handle.
    const ext = u.pathname.match(/\/extensions\/[0-9a-f-]{8,}\/([^/]+)\/assets\/([^/?]+)/i);
    if (ext) {
      const parsed = parseExtensionSegment(ext[1]);
      if (parsed) {
        add(`ext-${parsed.handle}`, titleCase(parsed.handle), false, s.url);
      } else {
        const file = ext[2].replace(/\.(min\.)?(js|css)$/, '');
        add(`ext-file-${file}`, `App extension (${ext[2]})`, false, s.url);
      }
      continue;
    }
    if (isPlatform(u.host, storeHost)) continue;
    if (GENERIC_CDN.test(u.host)) {
      add(`cdn-${u.host}`, `Script from ${u.host}`, false, s.url);
      continue;
    }
    add(`host-${u.host}`, u.host, false, s.url);
  }
  return [...apps.values()].sort((a, b) => a.name.localeCompare(b.name));
}

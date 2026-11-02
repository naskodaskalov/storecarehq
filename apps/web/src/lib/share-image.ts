// The link-preview image used when any StoreCare page is shared (LinkedIn, Slack, WhatsApp, X, iMessage…).
// It is drawn by app/welcome/opengraph-image.tsx and always served from the website host, so the same
// absolute URL works for pages on www, the apex domain and the app.

import { SHARE_IMAGE_PATH, WEBSITE_ORIGIN } from './domains.ts';

export const SHARE_IMAGE_ALT =
  'StoreCare HQ: know what changed on every client store before your client does. A branded monthly care report for a Shopify store.';

export const SHARE_IMAGE = {
  url: `${WEBSITE_ORIGIN}${SHARE_IMAGE_PATH}`,
  width: 1200,
  height: 630,
  alt: SHARE_IMAGE_ALT,
  type: 'image/png',
};

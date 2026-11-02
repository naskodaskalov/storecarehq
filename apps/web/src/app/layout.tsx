import type { Metadata } from 'next';
import type { ReactNode } from 'react';
// Fonts are bundled with the app (SIL Open Font License), so no page load contacts a font provider.
import '@fontsource/schibsted-grotesk/400.css';
import '@fontsource/schibsted-grotesk/500.css';
import '@fontsource/schibsted-grotesk/600.css';
import '@fontsource/schibsted-grotesk/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './globals.css';
import { WEBSITE_ORIGIN } from '@/lib/domains';
import { SHARE_IMAGE } from '@/lib/share-image';

const DESCRIPTION = 'Care-plan monitoring and monthly client reports for Shopify agencies.';

// Defaults for every page, including the app: any link to StoreCare shares with the same preview image.
// Pages that set their own openGraph or twitter fields must include SHARE_IMAGE too (Next.js replaces
// those objects rather than merging them).
export const metadata: Metadata = {
  metadataBase: new URL(WEBSITE_ORIGIN),
  title: 'StoreCare HQ',
  description: DESCRIPTION,
  openGraph: { type: 'website', siteName: 'StoreCare HQ', title: 'StoreCare HQ', description: DESCRIPTION, locale: 'en_US', images: [SHARE_IMAGE] },
  twitter: { card: 'summary_large_image', title: 'StoreCare HQ', description: DESCRIPTION, images: [SHARE_IMAGE] },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

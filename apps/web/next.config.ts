import type { NextConfig } from 'next';

// Keep everything except the public website out of search results: the app host, preview deployments
// and private report links. Mirrors shouldNoindex() in src/lib/seo.ts.
const NOINDEX = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];

const config: NextConfig = {
  // The storefront package ships TypeScript source.
  transpilePackages: ['@storecare/storefront', '@storecare/reports'],
  async headers() {
    return [
      { source: '/:path*', missing: [{ type: 'host', value: '(www\\.)?storecarehq\\.com' }], headers: NOINDEX },
      { source: '/r/:path*', headers: NOINDEX },
      { source: '/outreach/r/:path*', headers: NOINDEX },
    ];
  },
};

export default config;

import type { NextConfig } from 'next';

const config: NextConfig = {
  // The storefront package ships TypeScript source.
  transpilePackages: ['@storecare/storefront', '@storecare/reports'],
};

export default config;

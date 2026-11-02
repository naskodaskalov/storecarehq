import { test } from 'node:test';
import assert from 'node:assert/strict';
import { robotsTxt, shouldNoindex, sitemapXml } from './seo.ts';
import { hostRouting, isPublicPath, sessionRouting } from './domains.ts';

test('the website invites crawlers and points at its sitemap; other hosts turn them away', () => {
  const www = robotsTxt('www.storecarehq.com');
  assert.match(www, /Allow: \//);
  assert.match(www, /Sitemap: https:\/\/www\.storecarehq\.com\/sitemap\.xml/);
  assert.match(www, /Disallow: \/r\//);
  assert.equal(robotsTxt('app.storecarehq.com'), 'User-agent: *\nDisallow: /\n');
  assert.equal(robotsTxt('storecarehq-git-x.vercel.app'), 'User-agent: *\nDisallow: /\n');
});

test('the sitemap lists the landing page and policy pages on the website origin', () => {
  const xml = sitemapXml();
  for (const p of ['/', '/privacy', '/terms', '/dpa', '/bot']) assert.ok(xml.includes(`<loc>https://www.storecarehq.com${p}</loc>`), p);
  assert.doesNotMatch(xml, /app\.storecarehq/);
});

test('robots.txt and sitemap.xml are answered on each host, never redirected or sent to login', () => {
  for (const host of ['www.storecarehq.com', 'storecarehq.com', 'app.storecarehq.com', 'storecarehq.vercel.app']) {
    for (const path of ['/robots.txt', '/sitemap.xml']) {
      assert.equal(hostRouting(host, path), null, `${host}${path}`);
      assert.equal(sessionRouting(host, path, false), null, `${host}${path}`);
    }
  }
  assert.ok(isPublicPath('/robots.txt'));
});

test('only the public website is indexable, and report links never are', () => {
  assert.equal(shouldNoindex('www.storecarehq.com', '/'), false);
  assert.equal(shouldNoindex('storecarehq.com', '/privacy'), false);
  assert.equal(shouldNoindex('app.storecarehq.com', '/login'), true);
  assert.equal(shouldNoindex('www.storecarehq.com', '/r/abc'), true);
  assert.equal(shouldNoindex('my-preview.vercel.app', '/welcome'), true);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHARE_IMAGE } from './share-image.ts';
import { hostRouting, sessionRouting } from './domains.ts';

test('the shared preview image is an absolute website URL that loads without a session or redirect', () => {
  const url = new URL(SHARE_IMAGE.url);
  assert.equal(url.origin, 'https://www.storecarehq.com');
  assert.equal(hostRouting('www.storecarehq.com', url.pathname), null);
  assert.equal(sessionRouting('www.storecarehq.com', url.pathname, false), null);
  assert.deepEqual([SHARE_IMAGE.width, SHARE_IMAGE.height], [1200, 630]);
});

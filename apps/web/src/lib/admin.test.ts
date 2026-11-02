import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminEmails, isAdminEmail } from './admin.ts';

test('admin emails are parsed from a comma or space separated list, case-insensitively', () => {
  assert.deepEqual([...adminEmails(' A@x.com, b@y.com;c@z.com  nope ')], ['a@x.com', 'b@y.com', 'c@z.com']);
  assert.equal(isAdminEmail('B@Y.com', 'a@x.com,b@y.com'), true);
});

test('nobody is an admin when the list is empty or the email is missing', () => {
  assert.equal(isAdminEmail('a@x.com', ''), false);
  assert.equal(isAdminEmail('a@x.com', undefined), false);
  assert.equal(isAdminEmail(null, 'a@x.com'), false);
  assert.equal(isAdminEmail('a@x.com.evil', 'a@x.com'), false);
});

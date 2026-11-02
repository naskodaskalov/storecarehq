import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAgencyProfile } from './agency-profile.ts';

const base = { name: 'Northline Studio', brandColor: '#2747a8', logoUrl: '', senderEmail: '' };

test('valid profile is normalised', () => {
  const r = validateAgencyProfile({ ...base, name: '  Northline Studio ', senderEmail: 'Hello@Northline.Studio', logoUrl: 'https://cdn.example.com/logo.png' });
  assert.deepEqual(r, { ok: true, profile: { name: 'Northline Studio', brandColor: '#2747A8', logoUrl: 'https://cdn.example.com/logo.png', senderEmail: 'hello@northline.studio' } });
});

test('empty optional fields become null and colour falls back to the default', () => {
  const r = validateAgencyProfile({ ...base, brandColor: '' });
  assert.ok(r.ok);
  assert.equal(r.profile.brandColor, '#2747A8');
  assert.equal(r.profile.logoUrl, null);
  assert.equal(r.profile.senderEmail, null);
});

test('short and hashless hex colours are expanded', () => {
  const short = validateAgencyProfile({ ...base, brandColor: '#0a5' });
  const bare = validateAgencyProfile({ ...base, brandColor: 'ff6600' });
  assert.ok(short.ok && bare.ok);
  assert.equal(short.profile.brandColor, '#00AA55');
  assert.equal(bare.profile.brandColor, '#FF6600');
});

test('rejects bad input', () => {
  assert.equal(validateAgencyProfile({ ...base, name: '  ' }).ok, false);
  assert.equal(validateAgencyProfile({ ...base, brandColor: 'blue' }).ok, false);
  assert.equal(validateAgencyProfile({ ...base, logoUrl: 'http://example.com/logo.png' }).ok, false);
  assert.equal(validateAgencyProfile({ ...base, logoUrl: 'javascript:alert(1)' }).ok, false);
  assert.equal(validateAgencyProfile({ ...base, senderEmail: 'not-an-email' }).ok, false);
});

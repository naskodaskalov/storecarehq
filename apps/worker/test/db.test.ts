import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dbConfig } from '../src/db.ts';

test('local databases connect without TLS', () => {
  assert.deepEqual(dbConfig('postgresql://postgres@localhost:5432/postgres'), {
    connectionString: 'postgresql://postgres@localhost:5432/postgres',
  });
  assert.equal(dbConfig('postgresql://postgres@localhost/x?host=/var/run/pg').ssl, undefined);
});

test('remote databases use TLS and drop sslmode from the URL', () => {
  const prev = process.env.DATABASE_CA_CERT;
  delete process.env.DATABASE_CA_CERT;
  const c = dbConfig('postgresql://postgres.abc:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require');
  assert.ok(!c.connectionString.includes('sslmode'));
  assert.deepEqual(c.ssl, { rejectUnauthorized: false });

  process.env.DATABASE_CA_CERT = '-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----';
  const v = dbConfig('postgresql://postgres.abc:pw@aws-0-eu-west-1.pooler.supabase.com:5432/postgres');
  assert.deepEqual(v.ssl, { ca: '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----', rejectUnauthorized: true });
  if (prev === undefined) delete process.env.DATABASE_CA_CERT;
  else process.env.DATABASE_CA_CERT = prev;
});

test('missing DATABASE_URL is a clear error', () => {
  assert.throws(() => dbConfig(''), /DATABASE_URL is not set/);
});

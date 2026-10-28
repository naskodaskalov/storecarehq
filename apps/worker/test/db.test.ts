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
  assert.throws(() => dbConfig('  '), /DATABASE_URL is not set/);
});

test('pasted URLs with spaces, quotes or special characters in the password still work', () => {
  const host = 'aws-0-eu-west-1.pooler.supabase.com:5432/postgres';
  const cases: [string, string][] = [
    [`  postgresql://postgres.abc:simple123@${host}\n`, 'simple123'],
    [`"postgresql://postgres.abc:simple123@${host}"`, 'simple123'],
    [`postgresql://postgres.abc:p@ss#w/rd?x%@${host}`, 'p@ss#w/rd?x%'],
    [`postgresql://postgres.abc:p%40ss@${host}`, 'p@ss'],
  ];
  for (const [raw, password] of cases) {
    const c = dbConfig(raw);
    const u = new URL(c.connectionString);
    assert.equal(u.hostname, 'aws-0-eu-west-1.pooler.supabase.com', raw);
    assert.equal(u.port, '5432');
    assert.equal(u.username, 'postgres.abc');
    assert.equal(decodeURIComponent(u.password), password, raw);
    assert.equal(u.pathname, '/postgres');
  }
});

test('an unusable URL gives an error without the password in it', () => {
  assert.throws(
    () => dbConfig('my secret password'),
    (e: Error) => /not a valid connection string/.test(e.message) && !e.message.includes('secret'),
  );
});

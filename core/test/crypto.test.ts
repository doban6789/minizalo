import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NodeCryptoProvider, CryptoUnavailableError } from '../src/crypto/crypto-provider.js';

test('encrypts and decrypts round-trip with a passphrase', () => {
  const c = new NodeCryptoProvider('a-strong-passphrase');
  assert.equal(c.persistent, true);
  const secret = JSON.stringify({ imei: 'x', cookie: [], userAgent: 'ua' });
  const blob = c.encrypt(secret);
  assert.notEqual(blob, secret);
  assert.equal(c.decrypt(blob), secret);
});

test('same passphrase across instances decrypts (session persist across restart)', () => {
  const a = new NodeCryptoProvider('shared-pass-123');
  const b = new NodeCryptoProvider('shared-pass-123');
  const blob = a.encrypt('hello');
  assert.equal(b.decrypt(blob), 'hello');
});

test('no passphrase → session-only, refuses to persist (Red Team #3)', () => {
  const c = new NodeCryptoProvider(undefined);
  assert.equal(c.persistent, false);
  assert.throws(() => c.encrypt('x'), CryptoUnavailableError);
});

test('tampered blob fails auth (GCM integrity)', () => {
  const c = new NodeCryptoProvider('pass-abcdef');
  const blob = c.encrypt('secret');
  const parts = blob.split(':');
  const tampered = [...parts.slice(0, 4), Buffer.from('evil').toString('base64')].join(':');
  assert.throws(() => c.decrypt(tampered));
});

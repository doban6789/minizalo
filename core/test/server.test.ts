import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCore, type RunningCore } from '../src/index.js';
import { NodeCryptoProvider } from '../src/crypto/crypto-provider.js';

let core: RunningCore;
let dir: string;
let key: string;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'mz-test-'));
  core = createCore({ dbPath: join(dir, 'test.db'), crypto: new NodeCryptoProvider('test-passphrase'), log: () => {} });
  await core.app.ready();
  key = core.ctx.apiKey;
});

after(async () => {
  await core.close();
  rmSync(dir, { recursive: true, force: true });
});

const auth = { 'x-api-key': '' };
function withKey() {
  return { 'x-api-key': key };
}

test('/health is public and returns nonce', async () => {
  const res = await core.app.inject({ method: 'GET', url: '/health' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.nonce, core.ctx.nonce);
});

test('protected route without key → 401', async () => {
  const res = await core.app.inject({ method: 'GET', url: '/accounts' });
  assert.equal(res.statusCode, 401);
});

test('browser Origin → 403 (Red Team #12)', async () => {
  const res = await core.app.inject({
    method: 'GET',
    url: '/accounts',
    headers: { ...withKey(), origin: 'http://evil.example' },
  });
  assert.equal(res.statusCode, 403);
});

test('app:// origin is allowed', async () => {
  const res = await core.app.inject({
    method: 'GET',
    url: '/accounts',
    headers: { ...withKey(), origin: 'app://minizalo' },
  });
  assert.equal(res.statusCode, 200);
});

test('account slots cap at 6 (Red Team scope kept)', async () => {
  for (let i = 1; i <= 6; i++) {
    const res = await core.app.inject({ method: 'POST', url: '/accounts', headers: withKey(), payload: { label: `A${i}` } });
    assert.equal(res.statusCode, 201);
  }
  const seventh = await core.app.inject({ method: 'POST', url: '/accounts', headers: withKey(), payload: { label: 'A7' } });
  assert.equal(seventh.statusCode, 409);
});

test('scenario invalid trangThai → 400', async () => {
  const res = await core.app.inject({
    method: 'POST',
    url: '/scenarios',
    headers: withKey(),
    payload: { ten: 'X', trangThai: 'bogus' },
  });
  assert.equal(res.statusCode, 400);
});

test('scenario create + search returns scored hit', async () => {
  await core.app.inject({
    method: 'POST',
    url: '/scenarios',
    headers: withKey(),
    payload: { ten: 'Khách hỏi giá', danhMuc: 'sales', thucTe: 'hỏi giá', trangThai: 'da_xong' },
  });
  const res = await core.app.inject({ method: 'GET', url: '/scenarios/search?q=gi%C3%A1', headers: withKey() });
  assert.equal(res.statusCode, 200);
  const hits = res.json().results;
  assert.ok(hits.length >= 1);
  assert.ok(typeof hits[0].score === 'number' && hits[0].score >= 1);
});

test("SQL-injection attempt in search is treated as a literal (no error, no leak)", async () => {
  const res = await core.app.inject({
    method: 'GET',
    url: `/scenarios/search?q=${encodeURIComponent("' OR 1=1 --")}`,
    headers: withKey(),
  });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().results, []); // literal match, nothing found
});

test('webhook to link-local/metadata IP → 400 (SSRF guard #14)', async () => {
  const res = await core.app.inject({
    method: 'POST',
    url: '/webhooks',
    headers: withKey(),
    payload: { url: 'http://169.254.169.254/latest/meta-data' },
  });
  assert.equal(res.statusCode, 400);
});

test('webhook with non-http scheme → 400', async () => {
  const res = await core.app.inject({
    method: 'POST',
    url: '/webhooks',
    headers: withKey(),
    payload: { url: 'ftp://example.com' },
  });
  assert.equal(res.statusCode, 400);
});

void auth;

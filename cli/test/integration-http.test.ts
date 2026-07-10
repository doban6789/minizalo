/**
 * CLI ↔ core integration over REAL HTTP on an ephemeral loopback port.
 * Short-lived (starts, drives, closes) so it survives sandboxes that reap
 * long-running servers. Exercises the actual fetch path + nonce verification.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCore, type RunningCore } from '../../core/src/index.js';
import { NodeCryptoProvider } from '../../core/src/crypto/crypto-provider.js';
import { ApiClient, ApiError, verifyCore } from '../src/api.js';

let core: RunningCore;
let dir: string;
let baseUrl: string;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'mz-cliint-'));
  core = createCore({ dbPath: join(dir, 'i.db'), crypto: new NodeCryptoProvider('pass1234'), log: () => {} });
  const info = await core.listen('127.0.0.1', 0);
  baseUrl = info.baseUrl;
});

after(async () => {
  await core.close();
  rmSync(dir, { recursive: true, force: true });
});

test('verifyCore passes with matching nonce, then client lists accounts', async () => {
  const cfg = { baseUrl, apiKey: core.ctx.apiKey, nonce: core.ctx.nonce };
  await verifyCore(cfg); // must not throw
  const client = new ApiClient(cfg);
  const res = (await client.get('/accounts')) as { accounts: unknown[] };
  assert.ok(Array.isArray(res.accounts));
});

test('verifyCore REFUSES when config nonce mismatches running core (Red Team #6)', async () => {
  await assert.rejects(
    () => verifyCore({ baseUrl, apiKey: core.ctx.apiKey, nonce: 'stale-nonce-does-not-match' }),
    /nonce does not match/,
  );
});

test('wrong API key → ApiError 401', async () => {
  const client = new ApiClient({ baseUrl, apiKey: 'WRONG', nonce: core.ctx.nonce });
  await assert.rejects(() => client.get('/accounts'), (e: unknown) => e instanceof ApiError && e.status === 401);
});

test('CLI can create and search a scenario end-to-end', async () => {
  const client = new ApiClient({ baseUrl, apiKey: core.ctx.apiKey, nonce: core.ctx.nonce });
  await client.post('/scenarios', { ten: 'CLI integ', danhMuc: 'ops', trangThai: 'moi' });
  const hits = (await client.get('/scenarios/search?q=integ')) as { results: unknown[] };
  assert.ok(hits.results.length >= 1);
});

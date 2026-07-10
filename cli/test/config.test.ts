import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig } from '../src/config.js';

test('flags take precedence and produce a clean baseUrl', () => {
  const cfg = resolveConfig({ url: 'http://127.0.0.1:9000/', key: 'K' });
  assert.equal(cfg.baseUrl, 'http://127.0.0.1:9000');
  assert.equal(cfg.apiKey, 'K');
});

test('env vars are used when no flags given', () => {
  process.env.MINIZALO_URL = 'http://127.0.0.1:9100';
  process.env.MINIZALO_KEY = 'ENVKEY';
  try {
    const cfg = resolveConfig();
    assert.equal(cfg.baseUrl, 'http://127.0.0.1:9100');
    assert.equal(cfg.apiKey, 'ENVKEY');
  } finally {
    delete process.env.MINIZALO_URL;
    delete process.env.MINIZALO_KEY;
  }
});

test('missing config throws a helpful error (no crash)', () => {
  const prev = process.env.MINIZALO_DATA_DIR;
  process.env.MINIZALO_DATA_DIR = '/nonexistent-minizalo-dir-xyz';
  try {
    assert.throws(() => resolveConfig(), /core not found|Incomplete/);
  } finally {
    if (prev === undefined) delete process.env.MINIZALO_DATA_DIR;
    else process.env.MINIZALO_DATA_DIR = prev;
  }
});

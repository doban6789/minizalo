import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCore, type RunningCore } from '../src/index.js';
import { NodeCryptoProvider } from '../src/crypto/crypto-provider.js';

let core: RunningCore;
let dir: string;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'mz-ws-'));
  core = createCore({ dbPath: join(dir, 'ws.db'), crypto: new NodeCryptoProvider('test-pass'), log: () => {} });
  await core.app.ready();
});

after(async () => {
  await core.close();
  rmSync(dir, { recursive: true, force: true });
});

test('WS: wrong key is rejected/closed, never receives events (Red Team #12)', async () => {
  const ws = await core.app.injectWS('/stream');
  const result = await new Promise<{ closed: boolean; code?: number; gotMessage: boolean }>((resolve) => {
    let gotMessage = false;
    ws.on('message', () => (gotMessage = true));
    ws.on('close', (code: number) => resolve({ closed: true, code, gotMessage }));
    ws.on('open', () => ws.send(JSON.stringify({ apiKey: 'WRONG' })));
    // ws from injectWS may already be open
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ apiKey: 'WRONG' }));
  });
  assert.equal(result.gotMessage, false);
  assert.equal(result.closed, true);
  assert.equal(result.code, 4001);
});

test('WS: correct key authenticates and receives core_status ready', async () => {
  const ws = await core.app.injectWS('/stream');
  const first = await new Promise<any>((resolve, reject) => {
    ws.on('message', (data: Buffer) => resolve(JSON.parse(data.toString())));
    ws.on('close', (c: number) => reject(new Error('closed ' + c)));
    const send = () => ws.send(JSON.stringify({ apiKey: core.ctx.apiKey }));
    ws.on('open', send);
    if (ws.readyState === ws.OPEN) send();
    setTimeout(() => reject(new Error('timeout')), 3000);
  });
  assert.equal(first.kind, 'core_status');
  assert.equal(first.status, 'ready');
  ws.close();
});

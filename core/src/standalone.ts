/**
 * Headless entry point. Runs the core without Electron (VPS / dev / CI).
 * Credentials persist only if MINIZALO_PASSPHRASE is set (Red Team #3).
 * Writes an atomic, 0600 CLI config with the instance nonce (Red Team #6).
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { createCore } from './index.js';
import { NodeCryptoProvider } from './crypto/crypto-provider.js';

const HOST = process.env.MINIZALO_HOST ?? '127.0.0.1';
const PORT = Number(process.env.MINIZALO_PORT ?? 0); // 0 = ephemeral
const DATA_DIR = process.env.MINIZALO_DATA_DIR ?? join(homedir(), '.minizalo');
const CONFIG_PATH = join(DATA_DIR, 'config.json');

function writeCliConfig(data: { baseUrl: string; port: number; apiKey: string; nonce: string }): void {
  mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${CONFIG_PATH}.tmp`;
  writeFileSync(tmp, JSON.stringify({ ...data, startedAt: Date.now() }, null, 2), { mode: 0o600 });
  renameSync(tmp, CONFIG_PATH); // atomic replace
}

async function main(): Promise<void> {
  const crypto = new NodeCryptoProvider(process.env.MINIZALO_PASSPHRASE);
  if (!crypto.persistent) {
    console.warn('[minizalo] MINIZALO_PASSPHRASE not set — running SESSION-ONLY (sessions will not persist).');
  }

  const core = createCore({ dbPath: join(DATA_DIR, 'minizalo.db'), crypto });
  const { port, baseUrl } = await core.listen(HOST, PORT);

  writeCliConfig({ baseUrl, port, apiKey: core.ctx.apiKey, nonce: core.ctx.nonce });

  console.log(`[minizalo] core ready on ${baseUrl}`);
  // Do not print the API key to stdout (avoids leaking the bearer secret into
  // journald/log shippers). It's in the 0600 config file below.
  console.log(`[minizalo] API key + connection info written to: ${CONFIG_PATH}`);

  await core.restore();

  const shutdown = async (sig: string) => {
    console.log(`[minizalo] ${sig} — shutting down`);
    await core.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[minizalo] fatal:', err);
  process.exit(1);
});

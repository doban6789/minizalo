/**
 * MiniZalo core bootstrap. Assembles DB, repos, account manager, webhook
 * dispatcher and the Fastify server. Runs standalone (headless) or embedded in
 * Electron — the embedder injects the CryptoProvider (Red Team #1).
 */
import { randomBytes } from 'node:crypto';
import { openDatabase } from './db/database.js';
import { runMigrations } from './db/migrations.js';
import { migrations } from './db/migrations-list.js';
import { SettingsRepository } from './repositories/settings-repository.js';
import { AccountRepository } from './repositories/account-repository.js';
import { MessageRepository } from './repositories/message-repository.js';
import { WebhookRepository } from './repositories/webhook-repository.js';
import { ScenarioRepository } from './repositories/scenario-repository.js';
import { resolveApiKey } from './config.js';
import { EventBus } from './event-bus.js';
import { AccountManager } from './zalo/account-manager.js';
import { WebhookDispatcher } from './webhook/dispatcher.js';
import { buildServer } from './server/app.js';
import type { CoreContext } from './server/context.js';
import type { CryptoProvider } from './crypto/crypto-provider.js';

export const CORE_VERSION = '0.1.0';

export interface CoreOptions {
  dbPath: string;
  crypto: CryptoProvider;
  log?: (msg: string, err?: unknown) => void;
}

export interface RunningCore {
  ctx: CoreContext;
  /** Fastify instance — exposed for in-process testing via inject/injectWS. */
  app: ReturnType<typeof buildServer>;
  /** Start listening; returns the actual bound port (ephemeral when port=0). */
  listen: (host: string, port: number) => Promise<{ port: number; baseUrl: string }>;
  /** Restore persisted sessions (call after listen). */
  restore: () => Promise<void>;
  close: () => Promise<void>;
}

export function createCore(opts: CoreOptions): RunningCore {
  const log = opts.log ?? console.error;
  const db = openDatabase(opts.dbPath);
  const applied = runMigrations(db, migrations);
  if (applied.length) log(`[core] applied migrations: ${applied.join(', ')}`);

  const settings = new SettingsRepository(db);
  const accounts = new AccountRepository(db);
  const messages = new MessageRepository(db);
  const webhooks = new WebhookRepository(db);
  const scenarios = new ScenarioRepository(db);

  const apiKey = resolveApiKey(settings);
  const bus = new EventBus();
  const accountManager = new AccountManager(accounts, messages, bus, opts.crypto, log);
  const dispatcher = new WebhookDispatcher(webhooks, bus, log);
  const stopDispatcher = dispatcher.start();

  const ctx: CoreContext = {
    apiKey,
    nonce: randomBytes(16).toString('hex'),
    version: CORE_VERSION,
    cryptoPersistent: opts.crypto.persistent,
    accounts,
    messages,
    webhooks,
    scenarios,
    accountManager,
    bus,
  };

  const app = buildServer(ctx);

  return {
    ctx,
    app,
    async listen(host, port) {
      await app.listen({ host, port });
      const addr = app.server.address();
      const boundPort = typeof addr === 'object' && addr ? addr.port : port;
      return { port: boundPort, baseUrl: `http://${host}:${boundPort}` };
    },
    async restore() {
      await accountManager.restoreAll();
    },
    async close() {
      bus.publish({ kind: 'core_status', status: 'shutting_down' });
      accountManager.shutdown();
      stopDispatcher();
      await app.close();
      db.close();
    },
  };
}

export type { CoreContext } from './server/context.js';
export type { CryptoProvider } from './crypto/crypto-provider.js';
export { NodeCryptoProvider } from './crypto/crypto-provider.js';

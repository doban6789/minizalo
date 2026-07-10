import { randomBytes } from 'node:crypto';
import { ZaloAdapter, type PersistedCredentials, type ListenerCloseInfo } from './zalo-adapter.js';
import type { AccountRepository } from '../repositories/account-repository.js';
import type { MessageRepository } from '../repositories/message-repository.js';
import type { EventBus } from '../event-bus.js';
import type { CryptoProvider } from '../crypto/crypto-provider.js';
import type { AccountStatus, MiniEvent, ThreadKind } from '../types.js';

export const MAX_ACCOUNTS = 6;

/** zca-js CloseReason codes we treat specially (from spike). */
const DUPLICATE_CONNECTION = 3000;
const KICK_CONNECTION = 3003;

export class MaxAccountsError extends Error {
  constructor() {
    super(`Maximum ${MAX_ACCOUNTS} accounts reached`);
    this.name = 'MaxAccountsError';
  }
}

export class AccountManager {
  private adapters = new Map<string, ZaloAdapter>();

  constructor(
    private accounts: AccountRepository,
    private messages: MessageRepository,
    private bus: EventBus,
    private crypto: CryptoProvider,
    private log: (msg: string, err?: unknown) => void = console.error,
  ) {}

  private setStatus(id: string, status: AccountStatus, note: string | null = null): void {
    this.accounts.updateStatus(id, status, note);
    const view = this.accounts.get(id);
    if (view) this.bus.publish({ kind: 'account_status', account: view });
  }

  createSlot(label: string, phone: string | null): string {
    if (this.accounts.count() >= MAX_ACCOUNTS) throw new MaxAccountsError();
    const id = `acc_${randomBytes(8).toString('hex')}`;
    this.accounts.create(id, label, phone);
    const view = this.accounts.get(id);
    if (view) this.bus.publish({ kind: 'account_status', account: view });
    return id;
  }

  /**
   * Start a QR login. Returns once the QR image is available (via onQr); the
   * login completes in the background and flips the account to `online`.
   */
  async startQrLogin(id: string, onQr: (imageBase64: string) => void): Promise<void> {
    if (!this.accounts.get(id)) throw new Error('account not found');
    const adapter = new ZaloAdapter();
    this.adapters.set(id, adapter);
    this.setStatus(id, 'qr_pending');

    let qrDelivered: () => void;
    let qrFailed: (err: unknown) => void;
    const qrReady = new Promise<void>((res, rej) => {
      qrDelivered = res;
      qrFailed = rej;
    });

    // Background: run the QR flow to completion.
    adapter
      .loginQR({
        onQr: (img) => {
          onQr(img);
          qrDelivered();
        },
        onScanned: (info) => this.accounts.updateProfile(id, { avatar: info.avatar }),
      })
      .then((creds) => this.onLoggedIn(id, adapter, creds))
      .catch((err) => {
        this.log(`[account ${id}] QR login failed`, err);
        this.adapters.delete(id);
        this.setStatus(id, 'logged_out', 'QR login failed or aborted');
        // Settle qrReady so the HTTP caller doesn't hang if login failed
        // before a QR was ever generated.
        qrFailed(err);
      });

    // Wait until the QR is available (or the login failed early).
    await qrReady;
  }

  private async onLoggedIn(id: string, adapter: ZaloAdapter, creds: PersistedCredentials): Promise<void> {
    // Persist session only if we have secure storage (Red Team #3).
    if (this.crypto.persistent) {
      try {
        this.accounts.setCreds(id, this.crypto.encrypt(JSON.stringify(creds)));
      } catch (err) {
        this.log(`[account ${id}] could not persist session`, err);
      }
    }
    const ownId = await adapter.getOwnId();
    this.accounts.updateProfile(id, { ownId });
    this.attachListener(id, adapter);
    this.setStatus(id, 'online');
  }

  private attachListener(id: string, adapter: ZaloAdapter): void {
    adapter.startListener({
      onListenerConnected: () => this.log(`[account ${id}] listener connected`),
      onListenerError: (err) => this.log(`[account ${id}] listener error`, err),
      onListenerClosed: (info: ListenerCloseInfo) => this.onListenerClosed(id, info),
      onEvent: (event) => this.onEvent(id, event),
    });
  }

  private onListenerClosed(id: string, info: ListenerCloseInfo): void {
    if (info.code === DUPLICATE_CONNECTION || info.code === KICK_CONNECTION) {
      const reason =
        info.code === DUPLICATE_CONNECTION
          ? 'Listener stopped: Zalo Web opened elsewhere (duplicate connection)'
          : 'Listener stopped: connection kicked';
      this.setStatus(id, 'online', reason); // keep session, warn user
      this.bus.publish({ kind: 'listener_stopped', accountId: id, reason });
    }
    // Other close codes: zca-js retryOnClose handles reconnection.
  }

  private onEvent(id: string, event: Omit<MiniEvent, 'accountId'>): void {
    const full: MiniEvent = { ...event, accountId: id };
    // Persist inbound messages (store-all, Red Team #7 disk watchdog is separate).
    if (event.type === 'message' && event.threadId && event.threadType && event.content !== null) {
      this.messages.insert({
        accountId: id,
        threadId: event.threadId,
        threadType: event.threadType,
        direction: 'in',
        sender: event.sender,
        content: event.content,
        attachments: event.attachments,
        ts: event.ts,
      });
    }
    this.bus.publish({ kind: 'mini_event', event: full });
  }

  /** Restore all accounts with persisted sessions. Per-account isolation (#3/#7). */
  async restoreAll(): Promise<void> {
    if (!this.crypto.persistent) {
      this.log('[restore] no secure storage — skipping session restore (session-only mode)');
      return;
    }
    for (const id of this.accounts.withCreds()) {
      try {
        const blob = this.accounts.getCreds(id);
        if (!blob) continue;
        const creds = JSON.parse(this.crypto.decrypt(blob)) as PersistedCredentials;
        this.setStatus(id, 'logging_in');
        const adapter = new ZaloAdapter();
        await adapter.loginCookie(creds);
        this.adapters.set(id, adapter);
        const ownId = await adapter.getOwnId();
        this.accounts.updateProfile(id, { ownId });
        this.attachListener(id, adapter);
        this.setStatus(id, 'online');
      } catch (err) {
        this.log(`[restore] account ${id} failed — needs re-login`, err);
        this.setStatus(id, 'dead', 'Session restore failed — re-login required');
      }
    }
  }

  async sendMessage(
    id: string,
    args: { threadId: string; threadType: ThreadKind; text?: string; imagePath?: string; imageBase64?: string },
  ): Promise<{ msgId: number | null }> {
    const adapter = this.adapters.get(id);
    if (!adapter || !adapter.isLoggedIn) throw new Error('account not online');
    const res = await adapter.sendMessage(args);
    const now = Date.now();
    this.messages.insert({
      accountId: id,
      threadId: args.threadId,
      threadType: args.threadType,
      direction: 'out',
      sender: this.accounts.get(id)?.ownId ?? null,
      content: args.text ?? (args.imagePath || args.imageBase64 ? '[image]' : ''),
      attachments: args.imagePath || args.imageBase64 ? [{ kind: 'image' }] : null,
      ts: now,
    });
    this.bus.publish({
      kind: 'mini_event',
      event: {
        accountId: id,
        type: 'message',
        threadId: args.threadId,
        threadType: args.threadType,
        sender: this.accounts.get(id)?.ownId ?? null,
        content: args.text ?? '[image]',
        attachments: null,
        ts: now,
      },
    });
    return res;
  }

  logout(id: string): void {
    const adapter = this.adapters.get(id);
    adapter?.stopListener();
    this.adapters.delete(id);
    this.accounts.setCreds(id, null);
    this.setStatus(id, 'logged_out');
  }

  remove(id: string): void {
    this.adapters.get(id)?.stopListener();
    this.adapters.delete(id);
    this.accounts.remove(id);
  }

  shutdown(): void {
    for (const adapter of this.adapters.values()) adapter.stopListener();
    this.adapters.clear();
  }
}

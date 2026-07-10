/**
 * Isolation layer over zca-js (Red Team #2/#8/#9 baked in). This is the ONLY
 * file that imports zca-js — everything else talks to MiniZalo types, so a
 * breaking zca-js change is patched here alone.
 */
import { Zalo, ThreadType, LoginQRCallbackEventType, type Credentials } from 'zca-js';
import type { API } from 'zca-js';
import type { MiniEvent, ThreadKind } from '../types.js';
import { imageMetadataGetter, resolveImage } from './media.js';

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export type ListenerCloseInfo = { code: number; reason: string };

export interface AdapterCallbacks {
  onEvent: (event: Omit<MiniEvent, 'accountId'>) => void;
  onListenerClosed: (info: ListenerCloseInfo) => void;
  onListenerConnected: () => void;
  onListenerError: (err: unknown) => void;
}

/** Persisted session shape (from the GotLoginInfo QR event / getContext). */
export type PersistedCredentials = Credentials;

function threadKind(type: ThreadType): ThreadKind {
  return type === ThreadType.Group ? 'group' : 'user';
}

function toThreadType(kind: ThreadKind): ThreadType {
  return kind === 'group' ? ThreadType.Group : ThreadType.User;
}

export class ZaloAdapter {
  private zalo: Zalo;
  private api: API | null = null;

  constructor() {
    this.zalo = new Zalo({ imageMetadataGetter, selfListen: false, logging: false, checkUpdate: false });
  }

  get isLoggedIn(): boolean {
    return this.api !== null;
  }

  /**
   * QR login. `onQr` fires with a base64 image as soon as the QR is generated
   * (Red Team #2). The returned promise resolves with the captured credentials
   * (from GotLoginInfo) once the user scans — persist these for restore (#9).
   */
  async loginQR(handlers: {
    onQr: (imageBase64: string) => void;
    onScanned?: (info: { displayName: string; avatar: string }) => void;
  }): Promise<PersistedCredentials> {
    let captured: PersistedCredentials | null = null;
    const api = await this.zalo.loginQR({ userAgent: DEFAULT_UA }, (event) => {
      switch (event.type) {
        case LoginQRCallbackEventType.QRCodeGenerated:
          handlers.onQr(event.data.image);
          break;
        case LoginQRCallbackEventType.QRCodeScanned:
          handlers.onScanned?.({ displayName: event.data.display_name, avatar: event.data.avatar });
          break;
        case LoginQRCallbackEventType.GotLoginInfo:
          captured = {
            imei: event.data.imei,
            cookie: event.data.cookie,
            userAgent: event.data.userAgent,
          };
          break;
        default:
          break;
      }
    });
    this.api = api;
    if (!captured) {
      // Fallback: derive from the live context so restore still works.
      const ctx = api.getContext();
      const jar = api.getCookie().toJSON();
      captured = { imei: ctx.imei, cookie: jar?.cookies ?? [], userAgent: ctx.userAgent };
    }
    return captured;
  }

  /** Restore a session from persisted credentials (Red Team #9). */
  async loginCookie(creds: PersistedCredentials): Promise<void> {
    this.api = await this.zalo.login(creds);
  }

  async getOwnId(): Promise<string | null> {
    try {
      return this.api ? String(await this.api.getOwnId()) : null;
    } catch {
      return null;
    }
  }

  startListener(cb: AdapterCallbacks): void {
    if (!this.api) throw new Error('not logged in');
    const l = this.api.listener;
    l.on('connected', () => cb.onListenerConnected());
    l.on('error', (err) => cb.onListenerError(err));
    l.on('closed', (code, reason) => cb.onListenerClosed({ code: Number(code), reason: String(reason) }));
    l.on('message', (message) => {
      if (message.isSelf) return; // MVP: only inbound (selfListen already false)
      const data = message.data;
      const isText = typeof data.content === 'string';
      cb.onEvent({
        type: 'message',
        threadId: message.threadId,
        threadType: threadKind(message.type),
        sender: data.uidFrom ?? null,
        content: isText ? (data.content as string) : (data.content as { title?: string }).title ?? '[attachment]',
        attachments: isText ? null : [data.content],
        ts: Number(data.ts) || Date.now(),
        // Intentionally NOT attaching the raw zca-js object: it can be circular
        // (breaks JSON.stringify on the WS/webhook path) and would ship the full
        // untrimmed Zalo payload to every consumer.
      });
    });
    l.start({ retryOnClose: true });
  }

  stopListener(): void {
    try {
      this.api?.listener.stop();
    } catch {
      /* ignore */
    }
  }

  /** Send a text and/or image message. Returns zca-js message id if any. */
  async sendMessage(args: {
    threadId: string;
    threadType: ThreadKind;
    text?: string;
    imagePath?: string;
    imageBase64?: string;
  }): Promise<{ msgId: number | null }> {
    if (!this.api) throw new Error('not logged in');
    const type = toThreadType(args.threadType);

    if (args.imagePath || args.imageBase64) {
      const img = await resolveImage({ imagePath: args.imagePath, imageBase64: args.imageBase64 });
      try {
        const res = await this.api.sendMessage(
          { msg: args.text ?? '', attachments: [img.path] },
          args.threadId,
          type,
        );
        return { msgId: res.attachment?.[0]?.msgId ?? res.message?.msgId ?? null };
      } finally {
        await img.cleanup();
      }
    }

    const res = await this.api.sendMessage(args.text ?? '', args.threadId, type);
    return { msgId: res.message?.msgId ?? null };
  }
}

/**
 * Shared domain types for MiniZalo core.
 * The WS event envelope here is the FROZEN contract that P5 (UI) and P6 (CLI)
 * consume — see Red Team finding #13. All realtime traffic uses this shape.
 */

/** Zalo thread kinds — mirrors zca-js ThreadType (User=0, Group=1). */
export type ThreadKind = 'user' | 'group';

/** Lifecycle state of a managed Zalo account. */
export type AccountStatus =
  | 'logged_out' // no session
  | 'logging_in' // login in progress (cookie restore)
  | 'qr_pending' // QR generated, waiting for phone scan
  | 'online' // listener running
  | 'dead'; // session invalid / kicked — needs re-login

export interface AccountView {
  id: string;
  label: string;
  phone: string | null;
  status: AccountStatus;
  avatar: string | null;
  ownId: string | null;
  lastSeen: number | null;
  /** Last human-readable status note (e.g. "kicked: duplicate connection"). */
  note: string | null;
}

export type MessageDirection = 'in' | 'out';

export interface StoredMessage {
  id: number;
  accountId: string;
  threadId: string;
  threadType: ThreadKind;
  direction: MessageDirection;
  sender: string | null;
  content: string;
  /** JSON string of attachment descriptors. */
  attachments: string | null;
  ts: number;
}

/** A normalized inbound event produced by the listener bridge. */
export interface MiniEvent {
  accountId: string;
  /** message | reaction | undo | group_event ... (MVP surfaces `message`). */
  type: string;
  threadId: string | null;
  threadType: ThreadKind | null;
  sender: string | null;
  content: string | null;
  attachments: unknown[] | null;
  ts: number;
  /** Raw event payload for consumers that want full fidelity. */
  raw?: unknown;
}

/* ------------------------------------------------------------------ *
 * WS envelope — discriminated union. FROZEN contract (Red Team #13).
 * ------------------------------------------------------------------ */

export type ServerEvent =
  | { kind: 'mini_event'; event: MiniEvent }
  | { kind: 'account_status'; account: AccountView }
  | { kind: 'listener_stopped'; accountId: string; reason: string }
  | { kind: 'core_status'; status: 'ready' | 'shutting_down' };

/** First frame the client must send on a WS connection to authenticate. */
export interface WsAuthFrame {
  apiKey: string;
  /** Optional filter: only receive events for this account. */
  accountId?: string;
}

export interface WebhookRecord {
  id: string;
  url: string;
  /** Comma-separated event kinds, or '*' for all. */
  events: string;
  enabled: boolean;
}

export interface ScenarioRecord {
  id: string;
  ten: string; // Tên tình huống
  danhMuc: string; // Danh mục
  thucTe: string; // Thực tế
  cachLam: string; // Cách tôi làm
  rutKinhNghiem: string; // Tóm tắt và rút kinh nghiệm
  trangThai: string; // Trạng thái
  createdTs: number;
  updatedTs: number;
}

export const SCENARIO_STATUSES = ['moi', 'dang_xu_ly', 'da_xong', 'bo'] as const;
export type ScenarioStatus = (typeof SCENARIO_STATUSES)[number];

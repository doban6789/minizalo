import type { Db } from '../db/database.js';
import type { MessageDirection, StoredMessage, ThreadKind } from '../types.js';

interface MessageRow {
  id: number;
  account_id: string;
  thread_id: string;
  thread_type: string;
  direction: string;
  sender: string | null;
  content: string;
  attachments: string | null;
  ts: number;
}

function toModel(r: MessageRow): StoredMessage {
  return {
    id: r.id,
    accountId: r.account_id,
    threadId: r.thread_id,
    threadType: r.thread_type as ThreadKind,
    direction: r.direction as MessageDirection,
    sender: r.sender,
    content: r.content,
    attachments: r.attachments,
    ts: r.ts,
  };
}

export interface NewMessage {
  accountId: string;
  threadId: string;
  threadType: ThreadKind;
  direction: MessageDirection;
  sender: string | null;
  content: string;
  attachments: unknown[] | null;
  ts: number;
}

export class MessageRepository {
  constructor(private db: Db) {}

  insert(m: NewMessage): number {
    const info = this.db
      .prepare(
        `INSERT INTO messages (account_id, thread_id, thread_type, direction, sender, content, attachments, ts)
         VALUES (@accountId, @threadId, @threadType, @direction, @sender, @content, @attachments, @ts)`,
      )
      .run({
        accountId: m.accountId,
        threadId: m.threadId,
        threadType: m.threadType,
        direction: m.direction,
        sender: m.sender,
        content: m.content,
        attachments: m.attachments ? JSON.stringify(m.attachments) : null,
        ts: m.ts,
      });
    return Number(info.lastInsertRowid);
  }

  /** Batched insert in one transaction (Red Team #7 — amortize sync writes). */
  insertMany(rows: NewMessage[]): void {
    const stmt = this.db.prepare(
      `INSERT INTO messages (account_id, thread_id, thread_type, direction, sender, content, attachments, ts)
       VALUES (@accountId, @threadId, @threadType, @direction, @sender, @content, @attachments, @ts)`,
    );
    const tx = this.db.transaction((items: NewMessage[]) => {
      for (const m of items) {
        stmt.run({
          accountId: m.accountId,
          threadId: m.threadId,
          threadType: m.threadType,
          direction: m.direction,
          sender: m.sender,
          content: m.content,
          attachments: m.attachments ? JSON.stringify(m.attachments) : null,
          ts: m.ts,
        });
      }
    });
    tx(rows);
  }

  query(filter: { accountId?: string; threadId?: string; limit?: number; before?: number }): StoredMessage[] {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter.accountId) {
      clauses.push('account_id = @accountId');
      params.accountId = filter.accountId;
    }
    if (filter.threadId) {
      clauses.push('thread_id = @threadId');
      params.threadId = filter.threadId;
    }
    if (filter.before !== undefined && Number.isFinite(filter.before)) {
      clauses.push('ts < @before');
      params.before = filter.before;
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    // Guard against NaN (e.g. ?limit=abc) which would bind as NULL → LIMIT NULL (unbounded).
    const rawLimit = Number.isFinite(filter.limit) ? (filter.limit as number) : 100;
    const limit = Math.min(Math.max(rawLimit, 1), 1000);
    const rows = this.db
      .prepare(`SELECT * FROM messages ${where} ORDER BY ts DESC, id DESC LIMIT @limit`)
      .all({ ...params, limit }) as MessageRow[];
    return rows.map(toModel);
  }
}

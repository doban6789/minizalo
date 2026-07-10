import type { Db } from '../db/database.js';
import type { AccountStatus, AccountView } from '../types.js';

interface AccountRow {
  id: string;
  label: string;
  phone: string | null;
  status: string;
  creds_enc: string | null;
  avatar: string | null;
  own_id: string | null;
  proxy: string | null;
  note: string | null;
  last_seen: number | null;
  created_ts: number;
}

function toView(r: AccountRow): AccountView {
  return {
    id: r.id,
    label: r.label,
    phone: r.phone,
    status: r.status as AccountStatus,
    avatar: r.avatar,
    ownId: r.own_id,
    lastSeen: r.last_seen,
    note: r.note,
  };
}

export class AccountRepository {
  constructor(private db: Db) {}

  list(): AccountView[] {
    return (this.db.prepare('SELECT * FROM accounts ORDER BY created_ts ASC').all() as AccountRow[]).map(toView);
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number }).n;
  }

  getRow(id: string): AccountRow | undefined {
    return this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow | undefined;
  }

  get(id: string): AccountView | undefined {
    const row = this.getRow(id);
    return row ? toView(row) : undefined;
  }

  create(id: string, label: string, phone: string | null): AccountView {
    this.db
      .prepare('INSERT INTO accounts (id, label, phone, status, created_ts) VALUES (?, ?, ?, ?, ?)')
      .run(id, label, phone, 'logged_out', Date.now());
    return this.get(id)!;
  }

  updateStatus(id: string, status: AccountStatus, note: string | null = null): void {
    this.db
      .prepare('UPDATE accounts SET status = ?, note = ?, last_seen = ? WHERE id = ?')
      .run(status, note, Date.now(), id);
  }

  updateProfile(id: string, patch: { avatar?: string | null; ownId?: string | null; phone?: string | null }): void {
    const cur = this.getRow(id);
    if (!cur) return;
    this.db
      .prepare('UPDATE accounts SET avatar = ?, own_id = ?, phone = ? WHERE id = ?')
      .run(patch.avatar ?? cur.avatar, patch.ownId ?? cur.own_id, patch.phone ?? cur.phone, id);
  }

  /** Store encrypted credentials blob (or NULL to clear on logout). */
  setCreds(id: string, credsEnc: string | null): void {
    this.db.prepare('UPDATE accounts SET creds_enc = ? WHERE id = ?').run(credsEnc, id);
  }

  getCreds(id: string): string | null {
    return this.getRow(id)?.creds_enc ?? null;
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
  }

  /** Accounts that have a persisted session to restore on startup. */
  withCreds(): string[] {
    return (this.db.prepare('SELECT id FROM accounts WHERE creds_enc IS NOT NULL').all() as { id: string }[]).map(
      (r) => r.id,
    );
  }
}

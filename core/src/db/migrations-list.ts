/** Ordered migrations. LIKE-only search for scenarios (Red Team #15 — no FTS5). */
import type { Migration } from './migrations.js';

export const migrations: Migration[] = [
  {
    id: '001-init',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS accounts (
          id         TEXT PRIMARY KEY,
          label      TEXT NOT NULL,
          phone      TEXT,
          status     TEXT NOT NULL DEFAULT 'logged_out',
          creds_enc  TEXT,            -- encrypted {imei,cookie,userAgent}; NULL until logged in
          avatar     TEXT,
          own_id     TEXT,
          proxy      TEXT,            -- reserved for round 2 (unused in MVP)
          note       TEXT,
          last_seen  INTEGER,
          created_ts INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS messages (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id   TEXT NOT NULL,
          thread_id    TEXT NOT NULL,
          thread_type  TEXT NOT NULL,
          direction    TEXT NOT NULL,
          sender       TEXT,
          content      TEXT NOT NULL,
          attachments  TEXT,
          ts           INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_messages_account_thread ON messages (account_id, thread_id, ts);

        CREATE TABLE IF NOT EXISTS webhooks (
          id       TEXT PRIMARY KEY,
          url      TEXT NOT NULL,
          events   TEXT NOT NULL DEFAULT '*',
          enabled  INTEGER NOT NULL DEFAULT 1
        );
      `);
    },
  },
  {
    id: '002-scenarios',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS scenarios (
          id              TEXT PRIMARY KEY,
          ten             TEXT NOT NULL,
          danh_muc        TEXT NOT NULL DEFAULT '',
          thuc_te         TEXT NOT NULL DEFAULT '',
          cach_lam        TEXT NOT NULL DEFAULT '',
          rut_kinh_nghiem TEXT NOT NULL DEFAULT '',
          trang_thai      TEXT NOT NULL DEFAULT 'moi',
          created_ts      INTEGER NOT NULL,
          updated_ts      INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_scenarios_danh_muc ON scenarios (danh_muc);
        CREATE INDEX IF NOT EXISTS idx_scenarios_trang_thai ON scenarios (trang_thai);
      `);
    },
  },
];

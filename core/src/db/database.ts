/**
 * SQLite connection helper (better-sqlite3). WAL + busy_timeout per Red Team #7.
 *
 * NOTE: better-sqlite3 is synchronous (by design).
 * At current scale this is fine. If query volume increases significantly,
 * consider offloading to a worker thread or switching to better-sqlite3-worker-threads.
 */
import Database from 'better-sqlite3';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';

export type Db = Database.Database;

export function openDatabase(dbPath: string): Db {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  return db;
}

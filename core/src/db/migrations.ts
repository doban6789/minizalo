/**
 * Migration runner. Each migration + its `_migrations` bookkeeping row run in a
 * SINGLE transaction so a partial failure rolls back atomically (Red Team #10).
 */
import type { Db } from './database.js';

export interface Migration {
  id: string;
  up: (db: Db) => void;
}

export function runMigrations(db: Db, migrations: Migration[]): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id TEXT PRIMARY KEY,
    applied_ts INTEGER NOT NULL
  )`);

  const already = new Set<string>(
    db.prepare('SELECT id FROM _migrations').all().map((r) => (r as { id: string }).id),
  );

  const applied: string[] = [];
  for (const m of migrations) {
    if (already.has(m.id)) continue;
    const tx = db.transaction(() => {
      m.up(db);
      db.prepare('INSERT INTO _migrations (id, applied_ts) VALUES (?, ?)').run(m.id, Date.now());
    });
    tx();
    applied.push(m.id);
  }
  return applied;
}

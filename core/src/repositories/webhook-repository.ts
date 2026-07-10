import type { Db } from '../db/database.js';
import type { WebhookRecord } from '../types.js';

interface WebhookRow {
  id: string;
  url: string;
  events: string;
  enabled: number;
}

const toModel = (r: WebhookRow): WebhookRecord => ({
  id: r.id,
  url: r.url,
  events: r.events,
  enabled: r.enabled === 1,
});

export class WebhookRepository {
  constructor(private db: Db) {}

  list(): WebhookRecord[] {
    return (this.db.prepare('SELECT * FROM webhooks').all() as WebhookRow[]).map(toModel);
  }

  enabled(): WebhookRecord[] {
    return (this.db.prepare('SELECT * FROM webhooks WHERE enabled = 1').all() as WebhookRow[]).map(toModel);
  }

  create(id: string, url: string, events: string): WebhookRecord {
    this.db.prepare('INSERT INTO webhooks (id, url, events, enabled) VALUES (?, ?, ?, 1)').run(id, url, events);
    return toModel(this.db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id) as WebhookRow);
  }

  setEnabled(id: string, enabled: boolean): void {
    this.db.prepare('UPDATE webhooks SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id);
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM webhooks WHERE id = ?').run(id);
  }
}

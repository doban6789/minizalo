import { randomBytes } from 'node:crypto';
import type { SettingsRepository } from './repositories/settings-repository.js';

/**
 * Resolve the API key: reuse the persisted one, else generate + store.
 * The key itself is a bearer secret; it's stored in the local SQLite `settings`
 * table (same machine, loopback-only server). Callers guard the file perms.
 */
export function resolveApiKey(settings: SettingsRepository): string {
  const existing = settings.get('api_key');
  if (existing) return existing;
  const key = randomBytes(24).toString('base64url');
  settings.set('api_key', key);
  return key;
}

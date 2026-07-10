import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

export interface ResolvedConfig {
  baseUrl: string;
  apiKey: string;
  /** Instance nonce from the config file (verified against /health). */
  nonce?: string;
}

export interface ConfigOverrides {
  url?: string;
  key?: string;
}

const CONFIG_PATH = process.env.MINIZALO_DATA_DIR
  ? join(process.env.MINIZALO_DATA_DIR, 'config.json')
  : join(homedir(), '.minizalo', 'config.json');

/**
 * Resolve connection config. Precedence: CLI flags > env > config file.
 * (Red Team #6: the nonce from the config file is later verified against
 * /health before the API key is sent.)
 */
export function resolveConfig(overrides: ConfigOverrides = {}): ResolvedConfig {
  const url = overrides.url ?? process.env.MINIZALO_URL;
  const key = overrides.key ?? process.env.MINIZALO_KEY;
  if (url && key) return { baseUrl: url.replace(/\/$/, ''), apiKey: key };

  // Fall back to the config file written by the core at startup.
  let file: Partial<ResolvedConfig> = {};
  try {
    file = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    throw new Error(
      `MiniZalo core not found. Start the app/core, or pass --url and --key (config: ${CONFIG_PATH}).`,
    );
  }
  const baseUrl = url ?? file.baseUrl;
  const apiKey = key ?? file.apiKey;
  if (!baseUrl || !apiKey) {
    throw new Error(`Incomplete MiniZalo config at ${CONFIG_PATH}. Pass --url and --key explicitly.`);
  }
  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey, nonce: file.nonce };
}

export { CONFIG_PATH };

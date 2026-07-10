import type { ResolvedConfig } from './config.js';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Verify the core is alive AND is the same instance the config file describes,
 * BEFORE sending the API key (Red Team #6 — never send the bearer key to a
 * stranger process that grabbed the ephemeral port).
 */
export async function verifyCore(cfg: ResolvedConfig): Promise<void> {
  let health: { nonce?: string; status?: string };
  try {
    const res = await fetch(`${cfg.baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
    health = (await res.json()) as { nonce?: string; status?: string };
  } catch {
    throw new ApiError(`MiniZalo core not reachable at ${cfg.baseUrl} (is it running?)`);
  }
  if (cfg.nonce && health.nonce && health.nonce !== cfg.nonce) {
    throw new ApiError(
      'Config nonce does not match the running core (stale config or a different process on this port). Refusing to send the API key.',
    );
  }
}

export class ApiClient {
  constructor(private cfg: ResolvedConfig) {}

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${this.cfg.baseUrl}${path}`, {
      method,
      headers: {
        'x-api-key': this.cfg.apiKey,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) {
      throw new ApiError(json?.error ?? `HTTP ${res.status}`, res.status);
    }
    return json;
  }

  get(path: string) {
    return this.request('GET', path);
  }
  post(path: string, body?: unknown) {
    return this.request('POST', path, body);
  }
  put(path: string, body?: unknown) {
    return this.request('PUT', path, body);
  }
  del(path: string) {
    return this.request('DELETE', path);
  }

  wsUrl(): string {
    return this.cfg.baseUrl.replace(/^http/, 'ws') + '/stream';
  }
  apiKey(): string {
    return this.cfg.apiKey;
  }
}

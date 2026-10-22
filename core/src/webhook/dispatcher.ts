/**
 * Outbound webhook dispatcher (Red Team #14).
 * MVP: single POST + log on failure. NO retry queue, NO HMAC (deferred to v2 —
 * avoids the unbounded-queue OOM and keeps MVP simple).
 *
 * WARNING: HMAC signing NOT implemented.
 * Middleware webhook endpoint (main.py:373) validates HMAC signatures.
 * If brand has minizalo_webhook_secret configured, middleware WILL REJECT
 * unsigned webhooks from this dispatcher.
 *
 * Current production path: MiniZalo → middleware main.py directly
 * (bypasses webhook dispatcher entirely).
 *
 * TODO: Implement HMAC signing if/when consolidating to use dispatcher route.
 *
 * SSRF guard tuned to the threat model: this is a local self-run tool whose
 * webhook target is usually the user's own n8n (often on localhost/LAN), so we
 * do NOT blanket-block private ranges. We DO block link-local / cloud-metadata
 * (169.254/fe80) and require http|https, which stops the classic metadata SSRF
 * without breaking legitimate local integrations.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import crypto from 'node:crypto';
import type { EventBus } from '../event-bus.js';
import type { WebhookRepository } from '../repositories/webhook-repository.js';
import type { ServerEvent } from '../types.js';

function isBlockedIp(ip: string): boolean {
  // Link-local IPv4 (includes 169.254.169.254 cloud metadata) + IPv6 link-local.
  if (ip.startsWith('169.254.')) return true;
  if (ip.toLowerCase().startsWith('fe80:')) return true;
  if (ip === '::' || ip === '0.0.0.0') return true;
  return false;
}

export async function assertWebhookUrlAllowed(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid webhook URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Webhook URL must be http or https');
  }
  const host = url.hostname;
  const ips: string[] = [];
  if (isIP(host)) {
    ips.push(host);
  } else {
    try {
      const results = await lookup(host, { all: true });
      ips.push(...results.map((r) => r.address));
    } catch {
      throw new Error(`Cannot resolve webhook host: ${host}`);
    }
  }
  if (ips.some(isBlockedIp)) {
    throw new Error('Webhook host resolves to a blocked (link-local/metadata) address');
  }
}

function eventKind(event: ServerEvent): string {
  return event.kind === 'mini_event' ? event.event.type : event.kind;
}

function matches(filter: string, kind: string): boolean {
  if (filter.trim() === '*') return true;
  return filter
    .split(',')
    .map((s) => s.trim())
    .includes(kind);
}

export class WebhookDispatcher {
  // Simple local queue for retries
  private queue: Array<{ event: ServerEvent, wh: any, attempts: number, nextRunAt: number }> = [];
  private retryTimer: NodeJS.Timeout | null = null;
  
  constructor(
    private webhooks: WebhookRepository,
    private bus: EventBus,
    private log: (msg: string, err?: unknown) => void = console.error,
  ) {}

  start(): () => void {
    const unsub = this.bus.subscribe((event) => {
      // Do not forward core lifecycle noise to webhooks.
      if (event.kind === 'core_status') return;
      void this.dispatch(event);
    });
    
    this.retryTimer = setInterval(() => this.processQueue(), 1000);
    
    return () => {
      unsub();
      if (this.retryTimer) clearInterval(this.retryTimer);
    };
  }

  private async processQueue() {
    const now = Date.now();
    const toProcess = this.queue.filter(item => item.nextRunAt <= now);
    // Remove from queue temporarily
    this.queue = this.queue.filter(item => item.nextRunAt > now);
    
    for (const item of toProcess) {
      await this.tryDeliver(item.event, item.wh, item.attempts);
    }
  }

  private async tryDeliver(event: ServerEvent, wh: any, attempts: number = 0): Promise<void> {
    try {
      await assertWebhookUrlAllowed(wh.url);
      
      const rawBody = JSON.stringify(event);
      const headers: Record<string, string> = { 
        'content-type': 'application/json', 
        'user-agent': 'minizalo/0.1' 
      };
      
      if (wh.secret) {
        const signature = crypto.createHmac('sha256', wh.secret).update(rawBody).digest('hex');
        headers['x-webhook-signature'] = `sha256=${signature}`;
      }

      const res = await fetch(wh.url, {
        method: 'POST',
        headers,
        body: rawBody,
        redirect: 'manual',
        signal: AbortSignal.timeout(10_000),
      });

      if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
        this.log(`[webhook ${wh.id}] redirect refused (SSRF guard)`);
        // Do not retry on SSRF rejection or hard 4xx
      } else if (!res.ok) {
        this.log(`[webhook ${wh.id}] non-2xx: ${res.status}`);
        if (res.status >= 500 || res.status === 429) {
          this.scheduleRetry(event, wh, attempts);
        }
      }
    } catch (err) {
      this.log(`[webhook ${wh.id}] delivery failed`, err);
      this.scheduleRetry(event, wh, attempts);
    }
  }

  private scheduleRetry(event: ServerEvent, wh: any, attempts: number) {
    if (attempts >= 3) {
      this.log(`[webhook ${wh.id}] Max retries reached, discarding event`);
      return;
    }
    // Backoff: 5s, 15s, 45s
    const delays = [5000, 15000, 45000] as const;
    const delay = delays[attempts] ?? 45000;
    this.queue.push({
      event,
      wh,
      attempts: attempts + 1,
      nextRunAt: Date.now() + delay
    });
    this.log(`[webhook ${wh.id}] Queued for retry ${attempts + 1} in ${delay}ms`);
  }

  private async dispatch(event: ServerEvent): Promise<void> {
    const kind = eventKind(event);
    for (const wh of this.webhooks.enabled()) {
      if (!matches(wh.events, kind)) continue;
      await this.tryDeliver(event, wh, 0);
    }
  }
}

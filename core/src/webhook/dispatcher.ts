/**
 * Outbound webhook dispatcher (Red Team #14).
 * MVP: single POST + log on failure. NO retry queue, NO HMAC (deferred to v2 —
 * avoids the unbounded-queue OOM and keeps MVP simple).
 *
 * SSRF guard tuned to the threat model: this is a local self-run tool whose
 * webhook target is usually the user's own n8n (often on localhost/LAN), so we
 * do NOT blanket-block private ranges. We DO block link-local / cloud-metadata
 * (169.254/fe80) and require http|https, which stops the classic metadata SSRF
 * without breaking legitimate local integrations.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
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
  constructor(
    private webhooks: WebhookRepository,
    private bus: EventBus,
    private log: (msg: string, err?: unknown) => void = console.error,
  ) {}

  start(): () => void {
    return this.bus.subscribe((event) => {
      // Do not forward core lifecycle noise to webhooks.
      if (event.kind === 'core_status') return;
      void this.dispatch(event);
    });
  }

  private async dispatch(event: ServerEvent): Promise<void> {
    const kind = eventKind(event);
    for (const wh of this.webhooks.enabled()) {
      if (!matches(wh.events, kind)) continue;
      try {
        await assertWebhookUrlAllowed(wh.url);
        const res = await fetch(wh.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'user-agent': 'minizalo/0.1' },
          body: JSON.stringify(event),
          // Do NOT follow redirects — a 3xx to a link-local/metadata host would
          // bypass assertWebhookUrlAllowed (SSRF, Red Team #14 redirect gap).
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
        });
        if (res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400)) {
          this.log(`[webhook ${wh.id}] redirect refused (SSRF guard)`);
        } else if (!res.ok) {
          this.log(`[webhook ${wh.id}] non-2xx: ${res.status}`);
        }
      } catch (err) {
        this.log(`[webhook ${wh.id}] delivery failed`, err);
      }
    }
  }
}

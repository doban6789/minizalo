import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import type { CoreContext } from './context.js';
import type { ServerEvent, WsAuthFrame } from '../types.js';

const AUTH_TIMEOUT_MS = 5000;

function keyEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function eventAccountId(event: ServerEvent): string | null {
  switch (event.kind) {
    case 'mini_event':
      return event.event.accountId;
    case 'account_status':
      return event.account.id;
    case 'listener_stopped':
      return event.accountId;
    default:
      return null;
  }
}

/**
 * WS /stream. A socket is `authed:false` until it sends a valid {apiKey} frame.
 * The broadcaster NEVER sends events to an unauthenticated socket (Red Team #12).
 * Sockets that don't authenticate within AUTH_TIMEOUT_MS are closed.
 */
export function registerStreamRoute(app: FastifyInstance, ctx: CoreContext): void {
  app.get('/stream', { websocket: true }, (socket: WebSocket) => {
    let authed = false;
    let filterAccountId: string | undefined;
    let unsubscribe: (() => void) | null = null;

    const authTimer = setTimeout(() => {
      if (!authed) socket.close(4008, 'auth timeout');
    }, AUTH_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(authTimer);
      unsubscribe?.();
      unsubscribe = null;
    };

    socket.on('message', (raw: Buffer) => {
      if (authed) return; // only the first frame is used, for auth
      let frame: WsAuthFrame;
      try {
        frame = JSON.parse(raw.toString());
      } catch {
        socket.close(4000, 'invalid auth frame');
        return;
      }
      if (typeof frame.apiKey !== 'string' || !keyEqual(frame.apiKey, ctx.apiKey)) {
        socket.close(4001, 'unauthorized');
        return;
      }
      authed = true;
      clearTimeout(authTimer);
      filterAccountId = frame.accountId;
      unsubscribe = ctx.bus.subscribe((event) => {
        if (filterAccountId) {
          const acc = eventAccountId(event);
          if (acc !== null && acc !== filterAccountId) return;
        }
        try {
          socket.send(JSON.stringify(event));
        } catch {
          /* socket closing */
        }
      });
      socket.send(JSON.stringify({ kind: 'core_status', status: 'ready' } satisfies ServerEvent));
    });

    socket.on('close', cleanup);
    socket.on('error', cleanup);
  });
}

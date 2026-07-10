import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import websocket from '@fastify/websocket';
import { timingSafeEqual } from 'node:crypto';
import type { CoreContext } from './context.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerAccountRoutes } from './routes/accounts.js';
import { registerMessageRoutes } from './routes/messages.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { registerScenarioRoutes } from './routes/scenarios.js';
import { registerStreamRoute } from './ws.js';

const PUBLIC_PATHS = new Set(['/health']);

function keyEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Reject requests carrying a browser web Origin (DNS-rebinding / cross-tab
 * defense, Red Team #12). Legit callers (CLI, n8n, Electron custom-scheme
 * renderer) send no Origin, `null`, or an app: origin.
 */
function originAllowed(req: FastifyRequest): boolean {
  const origin = req.headers.origin;
  if (!origin || origin === 'null') return true;
  if (origin.startsWith('app://') || origin.startsWith('file://')) return true;
  return false; // any http(s):// browser origin is rejected
}

export function buildServer(ctx: CoreContext): FastifyInstance {
  const app = Fastify({ logger: false });

  app.register(websocket);

  // Routes + the auth hook must be registered AFTER the websocket plugin loads,
  // otherwise its onRoute hook never sees `{ websocket: true }` and /stream is
  // treated as a plain HTTP route (the handler would get a Request, not a
  // socket). `app.after()` runs once the preceding register() completes.
  app.after(() => {
    // Global auth + origin guard (skips public paths and the WS upgrade, which
    // authenticates via its first message).
    app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
      if (req.headers.upgrade?.toLowerCase() === 'websocket') {
        // Defense-in-depth: reject cross-origin browser WS handshakes too.
        // (The socket also can't receive events until it presents the API key.)
        if (!originAllowed(req)) {
          await reply.code(403).send({ error: 'origin_not_allowed' });
        }
        return;
      }
      if (!originAllowed(req)) {
        await reply.code(403).send({ error: 'origin_not_allowed' });
        return;
      }
      if (PUBLIC_PATHS.has(req.url.split('?')[0] ?? req.url)) return;
      const provided = req.headers['x-api-key'];
      if (typeof provided !== 'string' || !keyEqual(provided, ctx.apiKey)) {
        await reply.code(401).send({ error: 'unauthorized' });
        return;
      }
    });

    registerHealthRoutes(app, ctx);
    registerStreamRoute(app, ctx);
    registerAccountRoutes(app, ctx);
    registerMessageRoutes(app, ctx);
    registerWebhookRoutes(app, ctx);
    registerScenarioRoutes(app, ctx);
  });

  return app;
}

import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { CoreContext } from '../context.js';
import { assertWebhookUrlAllowed } from '../../webhook/dispatcher.js';

export function registerWebhookRoutes(app: FastifyInstance, ctx: CoreContext): void {
  app.get('/webhooks', async () => ({ webhooks: ctx.webhooks.list() }));

  app.post('/webhooks', async (req, reply) => {
    const body = (req.body ?? {}) as { url?: string; events?: string };
    if (!body.url) return reply.code(400).send({ error: 'url required' });
    try {
      await assertWebhookUrlAllowed(body.url);
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
    const id = `wh_${randomBytes(6).toString('hex')}`;
    const webhook = ctx.webhooks.create(id, body.url, body.events ?? '*');
    return reply.code(201).send({ webhook });
  });

  app.put('/webhooks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as { enabled?: boolean };
    if (typeof body.enabled !== 'boolean') return reply.code(400).send({ error: 'enabled (boolean) required' });
    ctx.webhooks.setEnabled(id, body.enabled);
    return { ok: true };
  });

  app.delete('/webhooks/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    ctx.webhooks.remove(id);
    return reply.code(204).send();
  });

  // Fire a synthetic event so the user can verify their consumer receives it.
  app.post('/webhooks/:id/test', async (req, reply) => {
    const { id } = req.params as { id: string };
    const wh = ctx.webhooks.list().find((w) => w.id === id);
    if (!wh) return reply.code(404).send({ error: 'not found' });
    try {
      await assertWebhookUrlAllowed(wh.url);
      const res = await fetch(wh.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'test', message: 'MiniZalo webhook test', ts: Date.now() }),
        redirect: 'manual', // don't follow redirects (SSRF guard)
        signal: AbortSignal.timeout(10_000),
      });
      const redirected = res.type === 'opaqueredirect' || (res.status >= 300 && res.status < 400);
      return { ok: res.ok && !redirected, status: res.status, redirected };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });
}

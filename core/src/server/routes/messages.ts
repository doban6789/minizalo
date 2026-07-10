import type { FastifyInstance } from 'fastify';
import type { CoreContext } from '../context.js';
import type { ThreadKind } from '../../types.js';

export function registerMessageRoutes(app: FastifyInstance, ctx: CoreContext): void {
  app.post('/accounts/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!ctx.accounts.get(id)) return reply.code(404).send({ error: 'account not found' });
    const body = (req.body ?? {}) as {
      to?: string;
      threadType?: string;
      text?: string;
      imageBase64?: string;
    };
    if (!body.to) return reply.code(400).send({ error: 'to (threadId) required' });
    const threadType: ThreadKind = body.threadType === 'group' ? 'group' : 'user';
    // NOTE: the network API deliberately does NOT accept `imagePath` — that would
    // let a caller exfiltrate any server-readable file as a Zalo attachment
    // (SSRF-style, review finding). Images must be sent as base64.
    if (!body.text && !body.imageBase64) {
      return reply.code(400).send({ error: 'text or imageBase64 required' });
    }
    try {
      const res = await ctx.accountManager.sendMessage(id, {
        threadId: body.to,
        threadType,
        text: body.text,
        imageBase64: body.imageBase64,
      });
      return { ok: true, msgId: res.msgId };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  app.get('/messages', async (req) => {
    const q = req.query as { accountId?: string; threadId?: string; limit?: string; before?: string };
    const messages = ctx.messages.query({
      accountId: q.accountId,
      threadId: q.threadId,
      limit: q.limit ? Number(q.limit) : undefined,
      before: q.before ? Number(q.before) : undefined,
    });
    return { messages };
  });
}

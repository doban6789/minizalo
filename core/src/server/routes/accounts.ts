import type { FastifyInstance } from 'fastify';
import type { CoreContext } from '../context.js';
import { MaxAccountsError } from '../../zalo/account-manager.js';

export function registerAccountRoutes(app: FastifyInstance, ctx: CoreContext): void {
  app.get('/accounts', async () => ({ accounts: ctx.accountManager ? ctx.accounts.list() : [] }));

  app.post('/accounts', async (req, reply) => {
    const body = (req.body ?? {}) as { label?: string; phone?: string };
    if (!body.label || typeof body.label !== 'string') {
      return reply.code(400).send({ error: 'label required' });
    }
    try {
      const id = ctx.accountManager.createSlot(body.label, body.phone ?? null);
      return reply.code(201).send({ id, account: ctx.accounts.get(id) });
    } catch (err) {
      if (err instanceof MaxAccountsError) return reply.code(409).send({ error: err.message });
      throw err;
    }
  });

  app.get('/accounts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const acc = ctx.accounts.get(id);
    if (!acc) return reply.code(404).send({ error: 'not found' });
    return { account: acc };
  });

  // Start QR login; resolves once the QR image is ready. Login completes in the
  // background and flips the account to `online` (announced over WS).
  app.post('/accounts/:id/login/qr', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!ctx.accounts.get(id)) return reply.code(404).send({ error: 'not found' });
    let image: string | null = null;
    try {
      await ctx.accountManager.startQrLogin(id, (img) => {
        image = img;
      });
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
    return { image, status: ctx.accounts.get(id)?.status };
  });

  app.post('/accounts/:id/logout', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!ctx.accounts.get(id)) return reply.code(404).send({ error: 'not found' });
    ctx.accountManager.logout(id);
    return { account: ctx.accounts.get(id) };
  });

  app.delete('/accounts/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!ctx.accounts.get(id)) return reply.code(404).send({ error: 'not found' });
    ctx.accountManager.remove(id);
    return reply.code(204).send();
  });
}

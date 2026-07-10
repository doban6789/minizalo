import type { FastifyInstance } from 'fastify';
import type { CoreContext } from '../context.js';

/** Public endpoint. CLI verifies `nonce` here before sending the API key (#6). */
export function registerHealthRoutes(app: FastifyInstance, ctx: CoreContext): void {
  app.get('/health', async () => ({
    status: 'ok',
    version: ctx.version,
    nonce: ctx.nonce,
    cryptoPersistent: ctx.cryptoPersistent,
    accounts: ctx.accounts.count(),
  }));
}

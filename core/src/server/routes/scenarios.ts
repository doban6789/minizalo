import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { CoreContext } from '../context.js';
import { SCENARIO_STATUSES } from '../../types.js';
import type { ScenarioInput } from '../../repositories/scenario-repository.js';

function parseInput(body: Record<string, unknown>): ScenarioInput {
  return {
    ten: String(body.ten ?? ''),
    danhMuc: body.danhMuc !== undefined ? String(body.danhMuc) : undefined,
    thucTe: body.thucTe !== undefined ? String(body.thucTe) : undefined,
    cachLam: body.cachLam !== undefined ? String(body.cachLam) : undefined,
    rutKinhNghiem: body.rutKinhNghiem !== undefined ? String(body.rutKinhNghiem) : undefined,
    trangThai: body.trangThai !== undefined ? String(body.trangThai) : undefined,
  };
}

function validStatus(s: string | undefined): boolean {
  return s === undefined || (SCENARIO_STATUSES as readonly string[]).includes(s);
}

export function registerScenarioRoutes(app: FastifyInstance, ctx: CoreContext): void {
  app.get('/scenarios', async (req) => {
    const q = req.query as { danhMuc?: string; trangThai?: string; limit?: string; offset?: string };
    return {
      scenarios: ctx.scenarios.list({
        danhMuc: q.danhMuc,
        trangThai: q.trangThai,
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      }),
    };
  });

  // AI-facing search. Stable `{...,score}` contract.
  app.get('/scenarios/search', async (req, reply) => {
    const q = req.query as { q?: string; limit?: string };
    if (!q.q) return reply.code(400).send({ error: 'q required' });
    return { results: ctx.scenarios.search(q.q, q.limit ? Number(q.limit) : undefined) };
  });

  app.post('/scenarios', async (req, reply) => {
    const input = parseInput((req.body ?? {}) as Record<string, unknown>);
    if (!input.ten) return reply.code(400).send({ error: 'ten required' });
    if (!validStatus(input.trangThai)) return reply.code(400).send({ error: 'invalid trangThai' });
    const id = `scn_${randomBytes(6).toString('hex')}`;
    return reply.code(201).send({ scenario: ctx.scenarios.create(id, input) });
  });

  app.put('/scenarios/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const input = parseInput((req.body ?? {}) as Record<string, unknown>);
    if (!validStatus(input.trangThai)) return reply.code(400).send({ error: 'invalid trangThai' });
    const updated = ctx.scenarios.update(id, input);
    if (!updated) return reply.code(404).send({ error: 'not found' });
    return { scenario: updated };
  });

  app.delete('/scenarios/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!ctx.scenarios.remove(id)) return reply.code(404).send({ error: 'not found' });
    return reply.code(204).send();
  });
}

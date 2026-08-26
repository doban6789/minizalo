/**
 * contacts.ts — Public Contacts API for Spec 017 Leads Pipeline.
 *
 * Exposes GET /contacts and GET /contacts/:id derived from the messages DB.
 * MiniZalo does not store a dedicated contacts table, so contact data is
 * inferred from message history (sender IDs, recent activity, message counts).
 *
 * Lead scoring is computed inline from engagement signals, matching the
 * ZaloCRM scoring model dimensions used by Spec 017:
 *   Engagement (35%) · Intent (30%) · Fit (15%) · Velocity (20%)
 *
 * Routes:
 *   GET /contacts          — list contacts (thread_type=user only) with leadScore
 *   GET /contacts/:id      — full contact detail by sender ID (= thread_id for DMs)
 */

import type { FastifyInstance } from 'fastify';
import type { CoreContext } from '../context.js';

// ─── Scoring constants (mirrors ZaloCRM constants.ts) ────────────────────────

const INTENT_KEYWORDS = [
  'giá', 'bao nhiêu', 'thanh toán', 'đặt hàng', 'mua', 'order', 'chuyển khoản',
  'qr', 'ship', 'giao hàng', 'hẹn', 'gặp', 'demo', 'tư vấn',
];

const NOW_MS = () => Date.now();

/**
 * Compute a simple leadScore (0-100) from message history for a contact.
 *
 * Dimensions:
 *   E = Engagement  (35%) — total inbound messages, recency of last message
 *   I = Intent      (30%) — buying-signal keywords in inbound messages
 *   F = Fit         (15%) — fixed 50 (no profile data available in MiniZalo)
 *   V = Velocity    (20%) — messages in last 7 days vs last 30 days
 */
function computeLeadScore(messages: Array<{ content: string; direction: string; ts: number }>): {
  leadScore: number;
  autoTags: string[];
  aggregateBreakdown: Record<string, number>;
  lastInboundAt: string | null;
} {
  const now = NOW_MS();
  const inbound = messages.filter((m) => m.direction === 'in');
  const lastInbound = inbound[0] ?? null;  // messages ordered DESC

  // ── Engagement (35%) ──────────────────────────────────────────────────────
  const totalIn = inbound.length;
  // More messages = more engaged, cap at 20 for full score
  const engagementRaw = Math.min(totalIn / 20, 1) * 100;

  // ── Intent (30%) ─────────────────────────────────────────────────────────
  let intentSignals = 0;
  for (const msg of inbound) {
    const lower = msg.content.toLowerCase();
    for (const kw of INTENT_KEYWORDS) {
      if (lower.includes(kw)) {
        intentSignals += 1;
        break;  // one signal per message max
      }
    }
  }
  const intentRaw = Math.min(intentSignals / 5, 1) * 100;

  // ── Fit (15%) — fixed 50 (no demographic data) ───────────────────────────
  const fitRaw = 50;

  // ── Velocity (20%) ───────────────────────────────────────────────────────
  const day7 = now - 7 * 24 * 3600 * 1000;
  const day30 = now - 30 * 24 * 3600 * 1000;
  const in7d = inbound.filter((m) => m.ts > day7).length;
  const in30d = inbound.filter((m) => m.ts > day30).length;
  const velocityRaw = in30d > 0 ? Math.min(in7d / in30d, 1) * 100 : 0;

  // ── Final score ───────────────────────────────────────────────────────────
  const leadScore = Math.round(
    (engagementRaw * 0.35) + (intentRaw * 0.30) + (fitRaw * 0.15) + (velocityRaw * 0.20),
  );

  // ── Auto tags ─────────────────────────────────────────────────────────────
  const autoTags: string[] = [];
  const silentDays = lastInbound
    ? (now - lastInbound.ts) / (24 * 3600 * 1000)
    : 999;

  if (silentDays < 1)       autoTags.push('active');
  if (silentDays >= 7 && silentDays < 15)  autoTags.push('cooling');
  if (silentDays >= 15 && silentDays < 60) autoTags.push('cold');
  if (silentDays >= 60)     autoTags.push('frozen');
  if (leadScore >= 80)      autoTags.push('ready');
  if (intentSignals >= 3)   autoTags.push('has-appointment');

  return {
    leadScore: Math.min(leadScore, 100),
    autoTags,
    aggregateBreakdown: {
      engagement: Math.round(engagementRaw),
      intent: Math.round(intentRaw),
      fit: fitRaw,
      velocity: Math.round(velocityRaw),
      finalScore: Math.min(leadScore, 100),
    },
    lastInboundAt: lastInbound ? new Date(lastInbound.ts).toISOString() : null,
  };
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerContactRoutes(app: FastifyInstance, ctx: CoreContext): void {

  /**
   * GET /contacts
   * List all unique DM contacts (thread_type=user, sender != own Zalo ID)
   * with computed leadScore and autoTags.
   */
  app.get('/contacts', async (_req, _reply) => {
    // Collect all own Zalo IDs to exclude them from contacts
    const ownIds = new Set(
      ctx.accounts.list()
        .map((a) => a.ownId)
        .filter(Boolean) as string[],
    );

    // Get all DM messages (thread_type = user)
    const allMessages = ctx.messages.query({ limit: 1000 });
    const dmMessages = allMessages.filter((m) => m.threadType === 'user');

    // Group by thread_id (= contact's Zalo ID for DMs)
    const threads = new Map<string, typeof dmMessages>();
    for (const msg of dmMessages) {
      // thread_id IS the contact's ID in 1:1 chats
      const cid = msg.threadId;
      if (!cid || ownIds.has(cid)) continue;
      if (!threads.has(cid)) threads.set(cid, []);
      threads.get(cid)!.push(msg);
    }

    const contacts = Array.from(threads.entries()).map(([contactId, msgs]) => {
      const { leadScore, autoTags, aggregateBreakdown, lastInboundAt } = computeLeadScore(msgs);
      // Get sender name from most recent inbound message sender field (usually null in MiniZalo)
      const inbound = msgs.filter((m) => m.direction === 'in');
      const lastMsg = msgs[0];

      return {
        id: contactId,
        fullName: null,          // MiniZalo has no contact name store
        phone: null,
        status: null,
        tags: [],
        notes: null,
        zaloName: null,
        leadScore,
        autoTags,
        statusId: null,
        createdAt: lastMsg ? new Date(msgs[msgs.length - 1]!.ts).toISOString() : null,
        updatedAt: lastMsg ? new Date(lastMsg.ts).toISOString() : null,
      };
    });

    return { contacts };
  });

  /**
   * GET /contacts/:id
   * Full contact detail by contact ID (= Zalo sender ID / thread_id for DMs).
   * Returns scoring breakdown, autoTags, statusRef, recent messages.
   * Compatible with ZaloCRM Public API shape expected by Spec 017.
   */
  app.get('/contacts/:id', async (req, reply) => {
    const { id: contactId } = req.params as { id: string };

    // Fetch all messages for this thread
    const messages = ctx.messages.query({ threadId: contactId, limit: 1000 });
    if (messages.length === 0) {
      return reply.code(404).send({ error: 'contact not found', id: contactId });
    }

    const { leadScore, autoTags, aggregateBreakdown, lastInboundAt } = computeLeadScore(messages);

    // Determine statusRef from score (mirrors ZaloCRM 8-stage pipeline)
    let statusRef: { name: string; order: number } | null = null;
    if (leadScore >= 76) {
      statusRef = { name: 'Nóng', order: 4 };
    } else if (leadScore >= 51) {
      statusRef = { name: 'Tiềm năng', order: 5 };
    } else if (leadScore >= 26) {
      statusRef = { name: 'Tiếp cận', order: 2 };
    } else {
      statusRef = { name: 'Mới', order: 1 };
    }

    // Recent appointments: none tracked in MiniZalo
    const appointments: unknown[] = [];

    const inboundCount = messages.filter((m) => m.direction === 'in').length;

    return {
      id: contactId,
      fullName: null,
      phone: null,
      email: null,
      status: statusRef?.name ?? null,
      statusId: null,
      statusRef,
      tags: [],
      notes: null,
      zaloName: null,
      source: 'zalo_personal',
      leadScore,
      autoTags,
      aggregateBreakdown,
      lastInboundAt,
      appointments,
      _count: { conversations: inboundCount },
      createdAt: messages.length > 0
        ? new Date(messages[messages.length - 1]!.ts).toISOString()
        : null,
      updatedAt: messages.length > 0
        ? new Date(messages[0]!.ts).toISOString()
        : null,
    };
  });
}

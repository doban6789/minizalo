#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { WebSocket } from 'ws';
import { resolveConfig, type ConfigOverrides } from './config.js';
import { ApiClient, ApiError, verifyCore } from './api.js';

const program = new Command();
program
  .name('minizalo')
  .description('MiniZalo CLI — control the local Zalo gateway core (for AI agents & scripts)')
  .option('--url <url>', 'core base URL (default: from config file / MINIZALO_URL)')
  .option('--key <key>', 'API key (default: from config file / MINIZALO_KEY)')
  .option('--pretty', 'pretty-print JSON output');

/** Build a verified client (checks nonce before sending the key — Red Team #6). */
async function client(): Promise<ApiClient> {
  const opts = program.opts<ConfigOverrides & { pretty?: boolean }>();
  const cfg = resolveConfig({ url: opts.url, key: opts.key });
  await verifyCore(cfg);
  return new ApiClient(cfg);
}

function out(data: unknown): void {
  const pretty = program.opts().pretty;
  process.stdout.write(JSON.stringify(data, null, pretty ? 2 : 0) + '\n');
}

function fail(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(JSON.stringify({ error: msg }) + '\n');
  process.exit(1);
}

program
  .command('accounts')
  .description('list accounts and their status')
  .action(async () => {
    try {
      out(await (await client()).get('/accounts'));
    } catch (e) {
      fail(e);
    }
  });

program
  .command('send')
  .description('send a message to a thread')
  .requiredOption('--account <id>', 'account id')
  .requiredOption('--to <threadId>', 'destination thread id')
  .option('--type <user|group>', 'thread type', 'user')
  .option('--text <text>', 'message text')
  .option('--image <path>', 'image file to send (read locally, sent as base64)')
  .action(async (o) => {
    try {
      const body: Record<string, unknown> = { to: o.to, threadType: o.type };
      if (o.text) body.text = o.text;
      if (o.image) body.imageBase64 = readFileSync(o.image).toString('base64');
      if (!o.text && !o.image) fail(new Error('provide --text and/or --image'));
      out(await (await client()).post(`/accounts/${o.account}/messages`, body));
    } catch (e) {
      fail(e);
    }
  });

program
  .command('listen')
  .description('stream realtime events as line-delimited JSON (for AI agent pipelines)')
  .option('--account <id>', 'only events for this account')
  .action(async (o) => {
    try {
      const c = await client();
      const connect = () => {
        const ws = new WebSocket(c.wsUrl());
        ws.on('open', () => ws.send(JSON.stringify({ apiKey: c.apiKey(), accountId: o.account })));
        ws.on('message', (data: Buffer) => process.stdout.write(data.toString() + '\n'));
        ws.on('close', () => {
          process.stdout.write(JSON.stringify({ kind: '_reconnect' }) + '\n');
          setTimeout(connect, 1500);
        });
        ws.on('error', (e) => process.stderr.write(JSON.stringify({ error: String(e) }) + '\n'));
      };
      connect();
    } catch (e) {
      fail(e);
    }
  });

program
  .command('messages')
  .description('read stored message history (for AI agent context / RAG)')
  .option('--account <id>', 'filter by account id')
  .option('--thread <threadId>', 'filter by thread id')
  .option('--limit <n>', 'max messages (default core limit)')
  .option('--before <ts>', 'only messages before this epoch-ms timestamp')
  .action(async (o) => {
    try {
      const qs = new URLSearchParams();
      if (o.account) qs.set('accountId', o.account);
      if (o.thread) qs.set('threadId', o.thread);
      if (o.limit) qs.set('limit', o.limit);
      if (o.before) qs.set('before', o.before);
      out(await (await client()).get(`/messages?${qs}`));
    } catch (e) {
      fail(e);
    }
  });

const scenario = program.command('scenario').description('manage improvement scenarios');
scenario
  .command('list')
  .option('--status <s>')
  .option('--category <c>')
  .action(async (o) => {
    try {
      const qs = new URLSearchParams();
      if (o.status) qs.set('trangThai', o.status);
      if (o.category) qs.set('danhMuc', o.category);
      out(await (await client()).get(`/scenarios?${qs}`));
    } catch (e) {
      fail(e);
    }
  });
scenario
  .command('search')
  .requiredOption('--q <query>')
  .action(async (o) => {
    try {
      out(await (await client()).get(`/scenarios/search?q=${encodeURIComponent(o.q)}`));
    } catch (e) {
      fail(e);
    }
  });
scenario
  .command('add')
  .requiredOption('--ten <ten>', 'tên tình huống')
  .option('--danh-muc <x>')
  .option('--thuc-te <x>')
  .option('--cach-lam <x>')
  .option('--rut-kinh-nghiem <x>')
  .option('--trang-thai <x>')
  .action(async (o) => {
    try {
      out(
        await (await client()).post('/scenarios', {
          ten: o.ten,
          danhMuc: o.danhMuc,
          thucTe: o.thucTe,
          cachLam: o.cachLam,
          rutKinhNghiem: o.rutKinhNghiem,
          trangThai: o.trangThai,
        }),
      );
    } catch (e) {
      fail(e);
    }
  });

scenario
  .command('update')
  .description('update a scenario (only provided fields change; e.g. mark --trang-thai da_xong)')
  .requiredOption('--id <id>')
  .option('--ten <x>')
  .option('--danh-muc <x>')
  .option('--thuc-te <x>')
  .option('--cach-lam <x>')
  .option('--rut-kinh-nghiem <x>')
  .option('--trang-thai <x>')
  .action(async (o) => {
    try {
      // Only send keys the user set; omitted fields are preserved server-side.
      const body: Record<string, unknown> = {};
      if (o.ten !== undefined) body.ten = o.ten;
      if (o.danhMuc !== undefined) body.danhMuc = o.danhMuc;
      if (o.thucTe !== undefined) body.thucTe = o.thucTe;
      if (o.cachLam !== undefined) body.cachLam = o.cachLam;
      if (o.rutKinhNghiem !== undefined) body.rutKinhNghiem = o.rutKinhNghiem;
      if (o.trangThai !== undefined) body.trangThai = o.trangThai;
      out(await (await client()).put(`/scenarios/${o.id}`, body));
    } catch (e) {
      fail(e);
    }
  });
scenario
  .command('delete')
  .description('delete a scenario by id')
  .requiredOption('--id <id>')
  .action(async (o) => {
    try {
      await (await client()).del(`/scenarios/${o.id}`);
      out({ ok: true, deleted: o.id });
    } catch (e) {
      fail(e);
    }
  });

const webhook = program.command('webhook').description('manage outbound webhooks');
webhook.command('list').action(async () => {
  try {
    out(await (await client()).get('/webhooks'));
  } catch (e) {
    fail(e);
  }
});
webhook
  .command('add')
  .requiredOption('--url <url>')
  .option('--events <list>', 'comma-separated event kinds or *', '*')
  .action(async (o) => {
    try {
      out(await (await client()).post('/webhooks', { url: o.url, events: o.events }));
    } catch (e) {
      fail(e);
    }
  });

program.parseAsync().catch((e) => fail(e instanceof ApiError ? e : e));

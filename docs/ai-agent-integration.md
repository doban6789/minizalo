# AI Agent Integration (CLI)

How an AI agent talks to MiniZalo's database **after install** — read/write the
scenarios knowledge base, read message history, send messages, manage accounts —
all through the local `minizalo` CLI (or the same REST API).

## The one rule

**Never open the SQLite file directly.** The desktop app holds a WAL lock on it,
and a direct read/write bypasses auth, input validation, and the SSRF guard —
and can corrupt the DB. The database is reached **only** through the running
app's loopback API. That's by design and already wired up.

```
MiniZalo app running                ~/.minizalo/config.json   (0600)
 ├─ core + SQLite (Electron main)  → { baseUrl, port, apiKey, nonce }
 └─ REST/WS on 127.0.0.1:<port>            │
                                           ▼
        AI agent  →  reads config  →  minizalo CLI / REST (X-API-Key)
                                           │
              accounts · messages(history) · scenarios(KB) · webhooks
```

## Prerequisites

1. **The core must be running.** Two ways:
   - **Desktop app** — launch MiniZalo; it starts the core and writes
     `~/.minizalo/config.json`.
   - **Headless (no GUI, e.g. a server for the agent)** — run the core binary:
     ```bash
     npx --package @minizalo/core minizalo-core     # or: minizalo-core (if installed)
     ```
     It binds loopback and writes the same config file.
2. **Install the CLI** (for shell-based agents):
   ```bash
   npm i -g @minizalo/cli
   ```
   The CLI auto-reads `~/.minizalo/config.json`, verifies the core's `nonce`, then
   sends the API key. No manual credentials needed. Override with `--url` / `--key`
   or `MINIZALO_URL` / `MINIZALO_KEY` if desired.

## CLI command reference

Every command prints **one line of JSON** to stdout (errors as `{"error":...}` to
stderr, non-zero exit) — easy for an LLM to parse. Add `--pretty` for humans.

| Command | Does | DB area |
|---|---|---|
| `minizalo accounts` | list accounts + status | accounts |
| `minizalo messages --account <id> [--thread <id>] [--limit N] [--before <ms>]` | read stored history | messages (read) |
| `minizalo send --account <id> --to <threadId> [--type user\|group] [--text ..] [--image path]` | send a message | messages (write) |
| `minizalo listen [--account <id>]` | stream live events as line-delimited JSON | realtime |
| `minizalo scenario list [--status <s>] [--category <c>]` | list knowledge base | scenarios (read) |
| `minizalo scenario search --q "<query>"` | search KB (returns `score`) | scenarios (read / RAG) |
| `minizalo scenario add --ten "..." [--danh-muc ..] [--thuc-te ..] [--cach-lam ..] [--rut-kinh-nghiem ..] [--trang-thai ..]` | log a new scenario | scenarios (write) |
| `minizalo scenario update --id <id> [--trang-thai da_xong] [...]` | update; only provided fields change | scenarios (write) |
| `minizalo scenario delete --id <id>` | delete a scenario | scenarios (write) |
| `minizalo webhook list` / `webhook add --url <url> [--events ..]` | manage push webhooks | webhooks |

`--trang-thai` values: `moi`, `dang_xu_ly`, `da_xong`, `bo`.

## The knowledge base as agent memory (main use case)

The scenarios table (Tên tình huống / Danh mục / Thực tế / Cách tôi làm / Tóm tắt
& rút kinh nghiệm / Trạng thái) is meant to be **read as knowledge and written as
learnings** by the agent:

```bash
# 1. Before acting, retrieve relevant past experience (RAG):
minizalo scenario search --q "khách phàn nàn giao hàng chậm"

# 2. After handling a situation, record the lesson:
minizalo scenario add \
  --ten "Khách phàn nàn giao chậm - đơn #123" \
  --danh-muc "cham-soc-khach" \
  --thuc-te "Khách nhắn bực vì trễ 2 ngày" \
  --cach-lam "Xin lỗi + tặng voucher + hẹn lại mốc giao" \
  --rut-kinh-nghiem "Chủ động báo trễ trước khi khách hỏi" \
  --trang-thai moi

# 3. Later, mark it resolved (only the status changes; other fields preserved):
minizalo scenario update --id scn_ab12cd34 --trang-thai da_xong
```

## Drop-in agent instructions

Paste this into your agent's system prompt / tool description:

```
You control a personal Zalo gateway via the `minizalo` CLI (already configured;
reads ~/.minizalo/config.json). All output is JSON.

Read message history:   minizalo messages --account <id> --thread <threadId> --limit 50
Send a reply:           minizalo send --account <id> --to <threadId> --text "<msg>"
Recall past experience: minizalo scenario search --q "<situation keywords>"
Record a new lesson:    minizalo scenario add --ten "<title>" --cach-lam "<what you did>" --rut-kinh-nghiem "<takeaway>"
Update a lesson status: minizalo scenario update --id <id> --trang-thai da_xong

Rules:
- Always `scenario search` for prior experience before deciding how to reply.
- After resolving a non-trivial situation, `scenario add` a short lesson.
- Never open the database file directly; use these commands only.
```

## REST equivalents (for n8n / non-shell agents)

Same endpoints, `X-API-Key` header, from `~/.minizalo/config.json`:

```bash
KEY=$(jq -r .apiKey ~/.minizalo/config.json); URL=$(jq -r .baseUrl ~/.minizalo/config.json)

curl -H "X-API-Key: $KEY" "$URL/messages?accountId=$ACC&limit=50"
curl -H "X-API-Key: $KEY" "$URL/scenarios/search?q=giao+hang"
curl -X PUT "$URL/scenarios/$ID" -H "X-API-Key: $KEY" -H 'content-type: application/json' \
     -d '{"trangThai":"da_xong"}'
```

Endpoints: `GET/POST /accounts`, `GET /accounts/:id`, `POST /accounts/:id/login/qr`,
`POST /accounts/:id/logout`, `DELETE /accounts/:id`, `GET /messages`,
`POST /accounts/:id/messages`, `GET/POST /scenarios`, `GET /scenarios/search`,
`PUT/DELETE /scenarios/:id`, `GET/POST /webhooks`, `PUT/DELETE /webhooks/:id`,
`POST /webhooks/:id/test`, `GET /health` (public, returns `nonce`).

## Safety & limits

- **Loopback only.** The API binds `127.0.0.1`. An agent on another host needs an
  SSH tunnel or reverse proxy — do not expose the port directly.
- **API key** lives in `~/.minizalo/config.json` (0600). Read it from there; never
  hardcode or commit it.
- **Images** are base64 over the network only (the API refuses a server file path).
- Sending via an **unofficial** Zalo API can get the account locked — apply agent
  rate limits and human review for outbound messages.

# MiniZalo

Open-source desktop tool to run **up to 6 personal Zalo accounts** side by side, with a
**local API gateway** (REST + WebSocket + Webhook + CLI) so AI agents and automation tools
like **n8n** can send/receive messages programmatically. Built on the unofficial
[`zca-js`](https://github.com/RFS-ADRENO/zca-js) library.

Everything runs **locally on your machine**. There is no cloud, no hosted service, no
telemetry. You download it (or build it), run it, and it listens only on `127.0.0.1`.

> ⚠️ **Disclaimer — read this first.** MiniZalo uses an **unofficial** Zalo API
> (`zca-js`). It is **not** affiliated with or endorsed by Zalo / VNG. Automating a
> personal account may violate Zalo's Terms of Service and **can get your account
> locked or banned**. Use accounts you can afford to lose, at your own risk. This
> project is provided "as is" with no warranty.

---

## Features

- **Multi-account:** log in up to 6 Zalo accounts (QR code), all listening in parallel.
- **Local-first storage:** SQLite database on Windows / macOS / Linux — messages,
  accounts, webhooks, and scenarios stay on your disk.
- **API gateway for automation** (all bound to `127.0.0.1`, protected by a static API key):
  - **REST** — accounts, messaging, scenarios, webhooks.
  - **WebSocket** `/stream` — real-time inbound messages & status events.
  - **Webhooks** — push events out to n8n / your own endpoint.
  - **CLI** — `minizalo` command for shell / AI-agent use.
- **Improvement-scenarios knowledge base:** a table (Tên tình huống / Danh mục / Thực tế /
  Cách tôi làm / Tóm tắt & rút kinh nghiệm / Trạng thái) that is both editable in the UI
  and searchable by AI via `GET /scenarios/search`.

### MVP scope

In: QR login (6 accounts), send/receive **text + image**, webhooks, scenarios CRUD + search,
CLI. Round 2: friend requests, groups, video/file/voice, proxy-per-account.

---

## Install

### Option A — download a release (recommended)

Grab the installer for your OS from the [Releases](../../releases) page:

- **Windows:** `MiniZalo-Setup-x.y.z.exe`
- **macOS:** `MiniZalo-x.y.z.dmg` (unsigned — see [deployment guide](docs/deployment-guide.md))
- **Linux:** `MiniZalo-x.y.z.AppImage` or the `.deb`

### Option B — build from source

Requires Node.js (see [`.nvmrc`](.nvmrc)) and a C/C++ toolchain (for `better-sqlite3`).

```bash
git clone <this-repo> minizalo && cd minizalo
npm ci                 # installs deps + rebuilds native module for Electron
npm run dev            # run the desktop app in dev mode
# or build installers for your platform:
npm run dist:linux     # / dist:win / dist:mac
```

---

## How it works

```
┌─────────────────────────────────────────┐
│ Electron app                            │
│  ┌───────────────┐   REST/WS (127.0.0.1)│
│  │ main process  │◀───────────┐         │
│  │  • headless   │            │         │
│  │    core       │      ┌─────┴──────┐  │
│  │  • SQLite     │      │ renderer   │  │
│  │  • zca-js     │      │ (React UI) │  │
│  │  • safeStorage│      └────────────┘  │
│  └──────┬────────┘                      │
└─────────┼───────────────────────────────┘
          │ REST / WS / Webhook (localhost + API key)
          ▼
   AI agent · n8n · CLI · your scripts
```

The **core** (Fastify server + SQLite + zca-js) runs inside the Electron main process, which
has OS-level secure storage for session credentials. The **UI** and the **CLI** are both thin
clients that talk to the core over the loopback API. See
[docs/system-architecture.md](docs/system-architecture.md) for detail.

---

## Using the API (AI agent / n8n)

When the app starts it writes connection info to `~/.minizalo/config.json` (mode `0600`):

```json
{ "baseUrl": "http://127.0.0.1:<port>", "apiKey": "<key>", "nonce": "…" }
```

Every request needs the `X-API-Key` header. The server only accepts loopback connections.

```bash
# List accounts
curl -H "X-API-Key: $KEY" http://127.0.0.1:$PORT/accounts

# Send a text message (threadType: user | group)
curl -X POST http://127.0.0.1:$PORT/accounts/$ACC/messages \
  -H "X-API-Key: $KEY" -H 'content-type: application/json' \
  -d '{"to":"<threadId>","threadType":"user","text":"Xin chào"}'

# Send an image — base64 ONLY (the API never reads a server-side file path)
curl -X POST http://127.0.0.1:$PORT/accounts/$ACC/messages \
  -H "X-API-Key: $KEY" -H 'content-type: application/json' \
  -d '{"to":"<threadId>","threadType":"user","imageBase64":"<...>"}'

# Search the scenarios knowledge base (for AI retrieval)
curl -H "X-API-Key: $KEY" "http://127.0.0.1:$PORT/scenarios/search?q=giao+hang"
```

**Real-time events** — connect a WebSocket to `/stream` and send `{"apiKey":"<key>"}` as the
first frame. You then receive a discriminated-union stream:
`mini_event` (inbound message), `account_status`, `listener_stopped`, `core_status`.

**Webhooks** — register a URL to have events pushed out (e.g. into an n8n webhook node):

```bash
curl -X POST http://127.0.0.1:$PORT/webhooks \
  -H "X-API-Key: $KEY" -H 'content-type: application/json' \
  -d '{"url":"https://n8n.example/webhook/zalo","events":"*"}'
```

### CLI

The CLI isn't published to npm yet — install it from source (`npm ci && npm run build --workspace minizalo-cli && npm i -g ./cli`). It auto-reads `~/.minizalo/config.json` and verifies the core's nonce before sending the key:

```bash
minizalo accounts
minizalo send --account <id> --to <threadId> --text "hello" --type user
minizalo send --account <id> --to <threadId> --image ./pic.png
minizalo messages --account <id> --thread <threadId> --limit 50   # read history
minizalo listen                                    # stream events as line-delimited JSON
minizalo scenario search --q "giao hang"           # read the knowledge base (RAG)
minizalo scenario add --ten "..." --cach-lam "..." --rut-kinh-nghiem "..."
minizalo scenario update --id <id> --trang-thai da_xong
minizalo webhook add --url https://n8n.example/webhook/zalo
```

For a full AI-agent playbook (headless mode, drop-in system prompt, the scenarios
knowledge base as agent memory), see **[docs/ai-agent-integration.md](docs/ai-agent-integration.md)**.

---

## Security notes

- The API binds **only to `127.0.0.1`** and requires a static **API key** (`X-API-Key`,
  timing-safe compared). Browser-origin requests are rejected.
- Session credentials are encrypted at rest via the OS keychain (Electron `safeStorage`).
  If no secure backend exists (e.g. a headless Linux box without a keyring), the core runs
  **session-only** — it never writes plaintext credentials.
- The image endpoint accepts **base64 only** — it will not read arbitrary files off the host.
- Inbound message content is rendered as **plain text** in the UI (no HTML execution).
- Webhook delivery blocks link-local / cloud-metadata addresses and does not follow
  redirects (SSRF hardening).
- **Supply chain:** `zca-js` handles your raw Zalo session cookie. Pin versions, review
  updates, and treat a dependency compromise as an account-takeover risk. CI runs
  `npm audit` on production dependencies.

**Never commit** your `~/.minizalo/config.json`, the SQLite database, or any `.env` file.

---

## Documentation

- [Hướng dẫn sử dụng (Tiếng Việt) — người dùng + AI agent](docs/huong-dan-su-dung.md)
- [AI agent integration (CLI)](docs/ai-agent-integration.md) · [AGENTS.md](AGENTS.md)
- [System architecture](docs/system-architecture.md)
- [Deployment / packaging guide](docs/deployment-guide.md)

## License

[MIT](LICENSE) © 2026 MiniZalo contributors.

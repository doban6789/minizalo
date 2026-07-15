# System Architecture

MiniZalo is a **local-first** desktop app. A headless **core** (Fastify + SQLite + zca-js)
runs inside the Electron **main process**; the **React UI** (renderer) and the **CLI** are
thin clients that talk to the core over a loopback HTTP/WebSocket API.

## Components

| Layer | Package / path | Responsibility |
|-------|----------------|----------------|
| Core | `core/` (`minizalo-core`) | REST/WS server, SQLite, zca-js account manager, webhook dispatcher |
| Electron main | `src/main/` | Hosts the core in-process, provides `safeStorage` crypto, writes CLI config, owns the BrowserWindow |
| Preload | `src/preload/` | `contextBridge` exposing only `getConfig()` (baseUrl + apiKey) to the renderer |
| Renderer | `src/renderer/` | React UI: accounts grid, chat, scenarios, webhooks, settings |
| CLI | `cli/` (`minizalo-cli`) | Shell/AI-agent client; reads `~/.minizalo/config.json` |

The core is deliberately UI-agnostic. It can also run standalone (`core/src/standalone.ts`,
bin `minizalo-core`) for headless/server use — the crypto provider is **injected** so the
same core works with Electron `safeStorage` or a Node passphrase-derived key.

## Process model

```
Electron main process
 ├─ createCore({ dbPath, crypto: SafeStorageCryptoProvider })
 │   ├─ Fastify server  → listen 127.0.0.1:<ephemeral>
 │   ├─ better-sqlite3  (WAL, migrations)
 │   ├─ AccountManager  → zca-js (≤6 accounts, parallel listeners)
 │   └─ WebhookDispatcher
 ├─ writes ~/.minizalo/config.json (0600): baseUrl, port, apiKey, nonce
 └─ BrowserWindow (contextIsolation, sandbox, nodeIntegration:false, CSP)
        └─ renderer → REST + WS to the core, key via preload IPC
```

Running the core in the **main** process (not a utilityProcess) is intentional: `safeStorage`
is only available there, so encrypted session credentials never leave that boundary.

## Data & security boundaries

- **Bind + auth:** server listens on `127.0.0.1` only; every route (except `/health`) requires
  a timing-safe `X-API-Key`. Browser `Origin` requests are rejected. WS `/stream` stays
  unauthenticated (0 events) until a valid `{apiKey}` first frame arrives (5s timeout).
- **Credential storage:** `accounts.creds_enc` is encrypted via the injected `CryptoProvider`.
  Electron uses `safeStorage` (OS keychain). If unavailable → session-only, **no plaintext**.
- **Image sending:** REST accepts **base64 only** — never a server-side file path (file-exfil
  prevention). Base64 is decoded to a temp file for zca-js.
- **XSS:** the UI renders message `content`/`sender` as plain text (React, no
  `dangerouslySetInnerHTML`).
- **SSRF:** webhook URLs must be http/https, link-local & cloud-metadata IPs are blocked, and
  delivery uses `redirect: 'manual'` (no redirect following).

## Event contract (WebSocket `/stream`)

A discriminated union, `kind`:

- `mini_event` — inbound message (mapped from zca-js).
- `account_status` — an account changed state (login, online, dead…).
- `listener_stopped` — a listener closed (e.g. same account opened in Zalo Web). Not fatal;
  the UI shows a banner.
- `core_status` — e.g. `shutting_down`.

## Persistence

SQLite (better-sqlite3, WAL, `busy_timeout`). Migrations run one-transaction-each at startup:

- `001-init` — `settings`, `accounts`, `messages`, `webhooks`
- `002-scenarios` — `scenarios` (the improvement-scenarios knowledge base)

Full message history is retained (no truncation). The DB lives in Electron's `userData`
directory.

## Build / distribution

`electron-vite` builds three bundles (`out/main`, `out/preload` [CommonJS `.cjs` for the
sandboxed preload], `out/renderer`). `electron-builder` packages per-OS installers and
unpacks the native `better-sqlite3` binding from the asar archive. See
[deployment-guide.md](deployment-guide.md).

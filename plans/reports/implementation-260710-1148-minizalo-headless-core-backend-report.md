---
title: Implementation — MiniZalo headless core backend
date: 2026-07-10
type: implementation
plan: 260710-1109-minizalo-electron-multi-account-zalo-tool
status: core-complete (P1-P4 code + tests); P5/P6/P7 pending
---

# MiniZalo — headless core backend (implementation report)

Built the full **headless core** (the risky, valuable 60% of the MVP): a standalone Node/TS Fastify gateway + SQLite + zca-js account manager + webhook dispatcher. Runs headless today; Electron will embed it later (PA B). **Typecheck clean, build clean, 16/16 tests pass, code-reviewed + fixes applied.**

## What's done

**Phase 1 (Scaffold & core skeleton) — ✅ complete**
- Monorepo (npm workspaces: `core`, `cli`), MIT, TS strict, `tsconfig.base` (Bundler resolution — zca-js ships a directory-reexport type entry NodeNext can't follow).
- `core/` bootstrap: DB open → **atomic migrations** (one tx each) → Fastify. Ephemeral port; atomic **0600** CLI config with instance **nonce** (Red Team #6).
- Crypto boundary (Red Team #1/#3): core takes an injected `CryptoProvider`; `NodeCryptoProvider` = AES-256-GCM (scrypt key). **No passphrase → session-only, `encrypt()` throws (no plaintext fallback).** safeStorage stays in Electron main (not built yet).

**Phase 4 (Scenarios & AI API) — ✅ complete**
- `scenarios` table + CRUD + `GET /scenarios/search?q=` (LIKE-only, escaped wildcards, stable `{...,score}` contract). Status enum validated.

**Phase 2 code (Zalo adapter & account manager) — code complete, live-login unverified**
- `zalo-adapter.ts` = ONLY file importing zca-js (grep-verified isolation). Spike-accurate: `loginQR` callback → QR base64 now + capture `{cookie,imei,userAgent}` on `GotLoginInfo` → persist → `zalo.login(creds)` restore. `imageMetadataGetter` at ctor. Passive health via listener close codes (3000/3003 = opened-elsewhere).
- `account-manager.ts`: ≤6 accounts (409 on 7th), per-account try/catch in `restoreAll`, listener bridge → event bus, message persistence, QR flow resolves on first QR (now also settles on early failure — review fix).

**Phase 3 code (messaging/webhook/WS) — code complete, live-message unverified**
- REST send (text + base64 image; **imagePath rejected over network** — review fix), `GET /messages` (NaN-limit guarded), `WS /stream` (authed-gate + 5s timeout — unauthed sockets receive 0 events, verified by test), webhook dispatcher (single POST, http/https only, link-local/metadata SSRF block + **`redirect:'manual'`** — review fix). Discriminated WS envelope frozen (Red Team #13).

## Verified live / by test
- REST: 401 no-key, 403 browser-Origin, 200 with key, /health public+nonce, config 0600.
- Accounts: create + **max-6 cap (409)**.
- Scenarios: create/search scoring, invalid-status 400, **SQL-injection attempt → literal, empty result**.
- Webhook: metadata-IP 400, non-http 400.
- WS: **wrong key → close 4001 + 0 events; correct key → core_status ready**.
- Crypto: round-trip, cross-instance decrypt (restart persistence), session-only refusal, GCM tamper detection.

## Code review (code-reviewer subagent) — all fixes applied
1. HIGH QR-login hang on early failure → settle promise on reject. **Fixed.**
2. MED webhook redirect SSRF bypass → `redirect:'manual'`. **Fixed.**
3. MED arbitrary-file exfil via `imagePath` over REST → REST accepts base64 only. **Fixed.**
4. API key no longer printed to stdout. **Fixed.**
5. NaN `limit` → unbounded query → `Number.isFinite` guard. **Fixed.**
6. WS upgrade Origin guard added (defense-in-depth). **Fixed.**
7. `raw` zca-js payload dropped from broadcast (circular/PII). **Fixed.**
8. `res.attachment?.[0]` optional chain. **Fixed.**

## Not yet built
- **P5** Electron main (utilityProcess spawn, supervisor/respawn, safeStorage crypto-bridge over MessagePort, BrowserWindow hardening) + React UI (6-account grid, QR, chat, scenarios, webhooks, settings, text-only render).
- **P6** CLI (`minizalo` thin REST client + nonce-verify before sending key).
- **P7** electron-builder packaging (nsis/dmg/AppImage+deb) + CI (npm ci + audit + electron-rebuild) + docs/README + LICENSE.

## Environment notes
- **Persistent servers get sandbox-killed here** (exit 144); verification done via in-process `app.inject`/`injectWS` tests (CI-friendly) — the one live curl run confirmed the same before the sandbox tightened.
- **Live Zalo login (P2/P3 runtime) needs a real phone to scan QR** — API contract is spike-verified but end-to-end login/receive/send unproven until tested with a real account.

## Unresolved questions
- Confirm real-account login works (needs phone) before calling P2/P3 done.
- Continue P5/P6/P7 in this session or a fresh one?

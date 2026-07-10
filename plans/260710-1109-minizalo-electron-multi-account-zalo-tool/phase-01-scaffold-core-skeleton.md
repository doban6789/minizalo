---
phase: 1
title: Scaffold & core skeleton
status: completed
effort: ''
priority: P1
dependencies: []
---

# Phase 1: Scaffold & core skeleton

## Overview
Dựng khung Electron + core headless (utilityProcess) + SQLite/migrations + Fastify server rỗng có auth API key. Kết thúc phase: app mở được, core chạy, `GET /health` trả 200 khi kèm API key.

## Requirements
- Functional: Electron main spawn core qua `utilityProcess`; core mở Fastify bind `127.0.0.1` cổng **ephemeral** (OS cấp, không hardcode), main nhận `{port,baseUrl}` từ core rồi truyền cho renderer (preload) và ghi ra config cho CLI (Validation S1); sinh API key lần đầu chạy, lưu qua safeStorage; migrations chạy lúc khởi động tạo DB rỗng. <!-- Updated: Validation Session 1 - ephemeral port -->
- DB layer: `better-sqlite3` thuần + SQL migrations viết tay, không ORM (Validation S1).
- Non-functional: TypeScript strict; monorepo workspaces (core, cli) + electron root; hot-reload dev qua electron-vite.

## Architecture
- `electron/main.ts`: tạo BrowserWindow (load UI dev/prod), `utilityProcess.fork(core)`, truyền cổng + đường dẫn userData; relay IPC tối thiểu (lấy API key/base URL để renderer gọi REST).
- `core/index.ts`: bootstrap — mở DB, chạy migrations, start Fastify, đăng ký `onExit` graceful.
- `core/db/`: `better-sqlite3` mở file trong `app.getPath('userData')/minizalo.db`; `migrations/` là mảng `{id, up(db)}` chạy tuần tự, bảng `_migrations` ghi đã chạy.
- `core/server/auth.ts`: preHandler kiểm `X-API-Key` === key lưu; loopback-only (Fastify `host: 127.0.0.1`).
- `core/config.ts`: đọc/ghi settings (api_key mã hoá, port) — safeStorage encrypt trước khi ghi DB `settings`.

## Related Code Files
- Create: `package.json` (workspaces), `tsconfig.base.json`, `electron/main.ts`, `electron/preload.ts`, `electron-vite.config.ts`
- Create: `core/index.ts`, `core/config.ts`, `core/server/app.ts`, `core/server/auth.ts`, `core/db/index.ts`, `core/db/migrations/index.ts`, `core/db/migrations/001-init.ts`
- Create: `.gitignore`, `.nvmrc`, `README.md` (stub)

## Implementation Steps
1. Init monorepo: root `package.json` với workspaces `core`, `cli`; devDeps electron, electron-vite, typescript, @types/node.
2. `tsconfig.base.json` strict; per-package tsconfig extends.
3. Electron main: cửa sổ + `utilityProcess.fork` core; chờ core báo "ready {port,baseUrl}" qua message; expose qua preload cho renderer.
4. Core bootstrap: config → db open → migrations → fastify listen `127.0.0.1`.
5. Migration `001-init`: tạo bảng `settings`, `accounts`, `messages`, `webhooks`, `scenarios` (schema chi tiết ở phase tương ứng; ở đây tạo đủ cột đã biết + `_migrations`).
6. Auth preHandler + route `GET /health`.
7. safeStorage: sinh api_key ngẫu nhiên lần đầu, encrypt lưu; đọc giải mã lúc start.
8. Script dev (`electron-vite dev`) + placeholder renderer `index.html` "MiniZalo core: {status}".

## Success Criteria
- [ ] `npm run dev` mở app; core log "ready" với port.
- [ ] `curl -H "X-API-Key: <key>" http://127.0.0.1:<port>/health` → 200; thiếu/sai key → 401.
- [ ] Không có key → request từ ngoài loopback bị từ chối (bind 127.0.0.1).
- [ ] File `minizalo.db` tạo trong userData, bảng `_migrations` có `001-init`.
- [ ] Restart app: cùng api_key (persist), không sinh lại.

## Risk Assessment
- `utilityProcess` API khác giữa Electron versions → pin Electron version, test fork sớm.
- safeStorage chưa sẵn trên Linux thiếu keyring → fallback: cảnh báo + lưu key plaintext trong userData chỉ khi safeStorage `isEncryptionAvailable()` false (ghi rõ trong README).
- better-sqlite3 native cần rebuild cho Electron → xử lý ở P7 nhưng bật electron-rebuild ngay dev để tránh mismatch ABI.

## Red Team Hardening — Session 1 (bắt buộc)
<!-- Updated: Red Team Session 1 -->
- **[Critical] safeStorage phải ở MAIN process, KHÔNG ở core:** `Electron.safeStorage` chỉ tồn tại trong main; `utilityProcess` là Node child → `safeStorage` undefined, encrypt/decrypt sẽ throw lúc bootstrap. → main giữ toàn bộ encrypt/decrypt (api_key + creds), truyền secret đã giải mã / hàm crypto sang core qua **MessagePort**. Core KHÔNG gọi safeStorage trực tiếp. Sửa `core/config.ts` + đặt `electron/crypto-bridge.ts` ở main.
- **[Critical] Supervisor cho core:** main `on('exit')` re-fork core với backoff mũ + crash-loop breaker; khi respawn re-publish `{port,baseUrl,nonce}` + trigger `restoreAll`. Không để 1 crash giết 6 session vĩnh viễn.
- **[Critical] Cổng ephemeral an toàn:** ghi config CLI **atomic** (temp+rename) quyền **0600**; kèm `nonce` instance + `startedAt`; `GET /health` trả `nonce`. Client (CLI) phải verify nonce khớp TRƯỚC khi gửi `X-API-Key` (tránh gửi key cho process lạ chiếm port).
- **[Critical] Fallback creds plaintext = HARD-FAIL:** nếu `safeStorage.isEncryptionAvailable()` false → KHÔNG ghi session plaintext; chạy session-only + cảnh báo, hoặc opt-in key phái sinh passphrase (scrypt). Không dùng hậu tố `_enc` cho cleartext. Mỗi blob mã hoá gắn **marker scheme/backend** để phát hiện lệch khi giải mã.
- **[Critical] Migration atomic:** mỗi migration chạy trong 1 transaction (`up()` + ghi `_migrations` cùng commit); DDL `IF NOT EXISTS`; backup file DB trước khi migrate lúc upgrade. Bật **WAL** + `busy_timeout`.
- **[High] Electron BrowserWindow hardening (cấu hình ở main):** `contextIsolation:true`, `sandbox:true`, `nodeIntegration:false`, CSP nghiêm ngặt. Preload chỉ expose baseUrl/apiKey tối thiểu. (Render text-only chi tiết ở P5.)

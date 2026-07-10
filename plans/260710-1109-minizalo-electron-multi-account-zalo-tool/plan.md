---
title: MiniZalo — Electron multi-account Zalo tool (MVP)
description: ''
status: pending
priority: P2
branch: ''
tags: []
blockedBy: []
blocks: []
created: '2026-07-10T04:21:45.551Z'
createdBy: 'ck:plan'
source: skill
---

# MiniZalo — Electron multi-account Zalo tool (MVP)

## Overview

Electron desktop app (open-source, self-run, không host) quản lý tối đa 6 tài khoản Zalo cá nhân qua `zca-js`. Kiến trúc **PA B**: core Node/TS headless (Fastify REST+WS + better-sqlite3 + ≤6 zca-js adapter + webhook dispatcher) chạy qua Electron `utilityProcess`; UI React và CLI đều là **client REST mỏng** trên cùng core. Local-first: bind localhost + API key tĩnh.

**Nguồn:** Brainstorm report đã duyệt — `plans/reports/brainstorm-260710-1109-minizalo-multi-account-zalo-tool-report.md`. Lib nền: [zca-js](https://github.com/RFS-ADRENO/zca-js) ([docs](https://tdung.gitbook.io/zca-js)).

**MVP scope (plan này):** login QR/cookie 6 acc song song, nhận/gửi text+ảnh, webhook push, REST/WS, bảng scenarios CRUD+API+search, CLI, đóng gói 3 OS.
**Ngoài scope (vòng 2):** kết bạn / đồng ý kết bạn / tạo & quản lý nhóm / gửi video, file, voice.

**Ràng buộc nền (thiết kế cùng, không né):** rủi ro ban account = bình thường (health-check + re-login QR); 1 listener/account (UI cảnh báo); zca-js dễ vỡ khi Zalo đổi web (cô lập sau `zalo-adapter`, pin version); gửi ảnh v2 cần `imageMetadataGetter`; native module `better-sqlite3` cần electron-rebuild.

**Stack:** TypeScript · Electron + electron-vite · React + Vite · Fastify + @fastify/websocket · better-sqlite3 + migrations SQL thuần · zca-js · **Electron safeStorage (chạy ở MAIN process, không trong core — xem Red Team #1)** · electron-builder.

## Acceptance Criteria (MVP)

- [ ] Cài & chạy được trên Win/Mac/Linux từ artifact đóng gói.
- [ ] Login đồng thời 6 account (QR + cookie), session persist qua restart.
- [ ] Tin đến từ Zalo hiện realtime trên UI + đẩy webhook ra URL cấu hình.
- [ ] Gọi REST/CLI gửi **text + ảnh** thành công tới user & group thread.
- [ ] Bảng scenarios thêm/sửa/xoá trong UI + đọc qua `GET /scenarios` và `GET /scenarios/search?q=`.
- [ ] Mọi request API cần `X-API-Key`; server chỉ bind `127.0.0.1`; WS gate `authed` + Origin allowlist; socket chưa auth nhận 0 event.
- [ ] Gửi payload HTML/script tới account → UI hiển thị dạng text, không execute (renderer hardened).
- [ ] Core crash → main respawn + `restoreAll`; UI banner "core down".
- [ ] Creds mã hoá ở main process; Linux thiếu keyring → session-only (KHÔNG lưu plaintext).

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Scaffold & core skeleton](./phase-01-scaffold-core-skeleton.md) | Completed |
| 2 | [Zalo adapter & account manager](./phase-02-zalo-adapter-account-manager.md) | Pending |
| 3 | [Messaging webhook & realtime](./phase-03-messaging-webhook-realtime.md) | Pending |
| 4 | [Scenarios table & AI API](./phase-04-scenarios-table-ai-api.md) | Completed |
| 5 | [Electron UI (6-account grid)](./phase-05-electron-ui-6-account-grid.md) | Pending |
| 6 | [CLI client](./phase-06-cli-client.md) | Completed |
| 7 | [Packaging & CI](./phase-07-packaging-ci.md) | Pending |

## Phase Dependencies

- P1 → nền cho tất cả.
- P2 blockedBy P1.
- P3 blockedBy P2.
- P4 blockedBy P1 (độc lập P2/P3, có thể song song sau P1).
- P5 (UI) blockedBy P2, P3, P4 (client của các API đó).
- P6 (CLI) blockedBy P3, P4.
- P7 (packaging) blockedBy P5, P6 (đóng gói toàn bộ).

## Cross-Plan Dependencies

Không có plan nào khác trong `./plans/` — greenfield. Không cross-plan blocking.

## Validation Log

### Session 1 — 2026-07-10

**Verification Results**
- Claims checked: 0 | Verified: 0 | Failed: 0 | Unverified: 0
- Tier: Full (7 phases) — **N/A cho greenfield**: mọi file là `Create`, không có path/symbol/endpoint sẵn để fact-check.

**Quyết định đã chốt**
1. **Lớp DB:** `better-sqlite3` thuần + SQL migrations viết tay (KISS). Không dùng ORM. → áp cho P1, P3, P4.
2. **Retention tin:** **Lưu toàn bộ, không cắt.** Chấp nhận DB phình dần đổi lấy full history cho AI/audit. → sửa P3 (bỏ mọi logic/ngưỡng retention).
3. **Proxy per-account:** **Vòng 2**, không làm MVP. Cột `proxy` giữ nullable trong `accounts` như chỗ dành sẵn, KHÔNG dùng ở MVP. → ghi chú P2.
4. **License & tên:** **MIT**, package/CLI tên **`minizalo`**. → chốt P6, P7.

**Quyết định mặc định (planner, low-risk — không cần hỏi)**
- WS `/stream` auth bằng **message đầu tiên `{apiKey}`** (không đặt apiKey trên query string → tránh rò qua log). → P3, P5, P6.
- Core cổng **ephemeral** (OS cấp), main truyền `{port,baseUrl}` cho renderer/CLI qua preload/config; không hardcode cổng. → P1.
- Search scenarios: **FTS5 nếu build có, fallback LIKE** (đã thiết kế P4).
- Session hết hạn không phục hồi được → status `dead` + re-login QR thủ công (đã thiết kế P2).

### Whole-Plan Consistency Sweep — Session 1
- Sửa mâu thuẫn retention: P3 (architecture, step 3, success criteria, risk) đồng bộ với "lưu toàn bộ".
- P2 ghi chú cột `proxy` reserved vòng 2.
- P6/P7 xác nhận MIT + `minizalo`.
- Không còn mâu thuẫn tồn đọng.

## Red Team Review

### Session — 2026-07-10
**Reviewers:** 4 (Security Adversary, Failure Mode Analyst, Assumption Destroyer, Scope & Complexity Critic).
**Findings:** 30 thô → dedup 15 kỹ thuật (tất cả **Accept**, apply) + 3 scope đụng quyết định user (user giữ nguyên cả 3).
**Severity:** 7 Critical, 8 High/Medium (sau gộp).

| # | Finding | Severity | Disposition | Applied |
|---|---------|----------|-------------|---------|
| 1 | safeStorage không chạy trong utilityProcess → mã hoá ở main + MessagePort | Critical | Accept | Completed |
| 2 | Hợp đồng loginQR sai (qrPath file/callback, resolve sau quét) | Critical | Accept | P2 |
| 3 | Fallback creds plaintext → hard-fail + scheme marker + isolate decrypt | Critical | Accept | P1, P2 |
| 4 | Stored-XSS → apiKey; Electron hardening + render text-only | Critical | Accept | Completed |
| 5 | Core không supervisor → main respawn + backoff + banner | Critical | Accept | P1, P5 |
| 6 | Cổng ephemeral stale → nonce/liveness + atomic 0600 + CLI verify | Critical | Accept | Completed |
| 7 | Disk-full cascade → watchdog + ảnh ra filesystem + WAL/batched | Critical | Accept | P3 |
| 8 | imageMetadataGetter là option lúc new Zalo; base64 cần temp file; group riêng | High | Accept | P2, P3 |
| 9 | Session restore cần imei/UA khớp → spike zca-js | High | Accept | P2 |
| 10 | Migration không atomic → transaction/migration + IF NOT EXISTS + backup | High | Accept | P1 |
| 11 | Health-check false-positive → transient vs auth-invalid, jitter, passive | High | Accept | P2 |
| 12 | WS auth state machine + Origin allowlist + authed-gate + timeout | High | Accept | P3 |
| 13 | Event WS chéo phase → envelope discriminated freeze ở P3 trước P5 | High | Accept | P3, P5 |
| 14 | Webhook: single POST+log, https+SSRF guard, defer HMAC+retry | High | Accept | P3 |
| 15 | Parameterized bắt buộc + LIKE-only MVP (bỏ dual FTS5) + AI confused-deputy | High | Accept | P3, P4 |
| + | Supply-chain: lockfile + npm ci + audit (zca-js cầm raw cookie) | High | Accept | P2, P7 |

**Scope challenges đụng quyết định user (KHÔNG tự đảo — user đã chốt giữ):**
- PA B vs PA A → **giữ PA B** (áp #1 mã hoá ở main). User chấp nhận chi phí đổi headless-ready.
- Scenarios MVP → **giữ trong MVP** (P4). Độc lập, không chặn core.
- CLI phase → **giữ P6** (user cần CLI cho AI agent).

### Whole-Plan Consistency Sweep — Red Team S1
- Xoá mâu thuẫn "Rò apiKey trong renderer → chấp nhận" (P5) → thay bằng hardening bắt buộc.
- safeStorage: Overview + P1 + P2 đồng bộ "mã hoá ở main, core nhận qua MessagePort".
- Webhook: P3 architecture (HMAC+retry) ↔ hardening (MVP single POST, defer HMAC+retry) — hardening là quyết định thắng cho MVP; giữ mô tả gốc như "vòng 2".
- Search: P4 architecture (FTS5+trigger) ↔ hardening (LIKE-only MVP) — hardening thắng cho MVP.
- Listener: P3 (4 event) ↔ hardening (chỉ `message` MVP) — hardening thắng.
- Acceptance criteria plan.md cập nhật thêm 4 tiêu chí hardening.
- Không còn mâu thuẫn tồn đọng chưa xử lý.

## Repo Layout (đề xuất)

```
minizalo/
├── package.json            # workspaces: core, cli; electron root
├── electron/               # main + preload; spawn core utilityProcess
├── core/                   # headless: server, adapter, db, webhook
│   ├── server/             # fastify routes, auth, ws
│   ├── zalo/               # zalo-adapter (cô lập zca-js)
│   ├── db/                 # better-sqlite3 + migrations
│   └── webhook/            # dispatcher
├── ui/                     # React + Vite renderer
├── cli/                    # minizalo CLI (REST client)
└── .github/workflows/      # build 3 OS + electron-rebuild
```

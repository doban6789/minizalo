---
phase: 6
title: "CLI client"
status: pending
effort: ""
priority: P2
dependencies: [3, 4]
---

# Phase 6: CLI client

## Overview
CLI `minizalo` — client REST mỏng cho AI Agent thao tác từ terminal (cùng máy). Không nhúng logic Zalo; chỉ gọi core API. Kết thúc phase: AI/dev điều khiển account, gửi tin, tail event, quản lý scenarios qua CLI.

## Requirements
- Functional: `accounts` (list/status), `send` (text/ảnh), `listen` (tail WS event, in JSON stream), `scenario` (add/list/search), `webhook` (list/add). Đọc baseUrl+apiKey từ config file hoặc env.
- Non-functional: output JSON (mặc định, hợp AI parse) + `--pretty`; exit code chuẩn; zero heavy deps (commander + fetch/ws).

## Architecture
- `cli/bin/minizalo.ts`: parser (commander); mỗi lệnh gọi `cli/api.ts` (REST client dùng chung shape với UI client).
- Config resolve: `--url/--key` > env `MINIZALO_URL`/`MINIZALO_KEY` > `~/.minizalo/config.json`.
- `listen`: kết nối WS `/stream`, in mỗi event 1 dòng JSON (line-delimited) → AI Agent đọc stdin stream dễ.
- Publish qua npm workspace `bin` để `npx minizalo` hoặc cài global.

## Related Code Files
- Create: `cli/bin/minizalo.ts`, `cli/api.ts`, `cli/config.ts`, `cli/commands/{accounts,send,listen,scenario,webhook}.ts`
- Modify: root `package.json` (workspace `cli`, `bin` field)

## Implementation Steps
1. `cli/config.ts`: resolve url+key theo thứ tự ưu tiên.
2. `cli/api.ts`: REST client kèm `X-API-Key` (tái dùng kiểu từ UI nếu tách được shared types).
3. Lệnh `accounts`: `GET /accounts` → in JSON/table.
4. Lệnh `send --account --to --type user|group [--text | --image path]` → `POST messages`.
5. Lệnh `listen [--account]` → WS stream, line-delimited JSON.
6. Lệnh `scenario add|list|search`, `webhook list|add`.
7. README ví dụ dùng cho AI Agent (pipe `listen` → agent, agent gọi `send`).

## Success Criteria
- [ ] `minizalo accounts` in đúng 6 account + status.
- [ ] `minizalo send --account A --to T --text "hi"` gửi thành công; `--image ./a.png` gửi ảnh.
- [ ] `minizalo listen` in stream JSON mỗi event realtime.
- [ ] `minizalo scenario search --q "..."` trả kết quả.
- [ ] Sai/thiếu API key → exit code != 0 + thông báo rõ.

## Risk Assessment
- CLI và core lệch version API → gộp shared types trong workspace, bump cùng nhau.
- `listen` mất kết nối → auto-reconnect + in event `_reconnect` để AI biết.
- AI gọi sai tham số → validation phía CLI + lỗi JSON có `error` field.

## Red Team Hardening — Session 1 (bắt buộc)
<!-- Updated: Red Team Session 1 -->
- **[Critical] Verify core sống + đúng instance TRƯỚC khi gửi key:** CLI đọc `~/.minizalo/config.json` (port ephemeral) → gọi `GET /health`, so **nonce** khớp config, mới gửi `X-API-Key`. Nếu app không chạy / port stale / nonce lệch → báo lỗi "core not running / stale config" + exit code != 0 (KHÔNG gửi key cho process lạ chiếm port).
- **[Medium] Đọc config an toàn:** tôn trọng quyền 0600; nếu nhiều instance ghi đè config → dùng nonce để phát hiện nói chuyện nhầm core.

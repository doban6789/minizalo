---
phase: 5
title: "Electron UI (6-account grid)"
status: pending
effort: ""
priority: P2
dependencies: [2, 3, 4]
---

# Phase 5: Electron UI (6-account grid)

## Overview
UI React (client REST/WS mỏng): grid 6 ô account, login QR, trạng thái realtime, xem/gửi tin, quản lý webhooks, bảng scenarios, settings (API key). Kết thúc phase: vận hành toàn bộ MVP qua UI.

## Requirements
- Functional: grid 6 ô (login QR/cookie, status, avatar, nút re-login/logout); panel hội thoại 1 account (list thread + gửi text/ảnh); tab Scenarios (bảng CRUD); tab Webhooks (CRUD + test); tab Settings (hiện API key + port + copy). Cảnh báo khi listener bị tắt (mở Zalo Web).
- Non-functional: gọi core qua REST + subscribe WS `/stream`; base URL + API key lấy từ preload IPC; responsive, không phụ thuộc mạng ngoài.

## Architecture
- `ui/` React + Vite; `ui/api/client.ts` wrapper fetch kèm `X-API-Key`; `ui/api/ws.ts` kết nối `/stream` auto-reconnect.
- State: React Query (hoặc store nhẹ) cho accounts/messages/scenarios; WS push cập nhật cache.
- Trang: `AccountsGrid`, `AccountChat`, `ScenariosTable`, `WebhooksPanel`, `Settings`.
- QR: `POST /accounts/:id/login/qr` → hiện ảnh QR; nghe event `account:status` qua WS để đổi sang `online`.
- Banner cảnh báo global khi nhận event `account:listener_stopped`.

## Related Code Files
- Create: `ui/main.tsx`, `ui/App.tsx`, `ui/api/client.ts`, `ui/api/ws.ts`
- Create: `ui/pages/AccountsGrid.tsx`, `ui/pages/AccountChat.tsx`, `ui/pages/ScenariosTable.tsx`, `ui/pages/WebhooksPanel.tsx`, `ui/pages/Settings.tsx`
- Create: `ui/components/AccountCard.tsx`, `ui/components/QrLogin.tsx`, `ui/components/StatusBadge.tsx`
- Modify: `electron/preload.ts` (expose baseUrl+apiKey), `electron-vite.config.ts` (renderer entry)

## Implementation Steps
1. `api/client.ts` + `api/ws.ts`; lấy baseUrl/apiKey từ `window.electron` (preload).
2. `AccountsGrid`: 6 `AccountCard` với status badge; thêm/xoá account; nút login QR (mở `QrLogin`), login cookie (form), logout, re-login.
3. WS subscribe: cập nhật status account + đẩy message mới vào chat đang mở.
4. `AccountChat`: chọn thread, xem lịch sử (`GET /messages`), gửi text + đính ảnh (`POST messages`).
5. `ScenariosTable`: bảng 6 cột + form thêm/sửa, filter danh_mục/trạng_thái, ô search.
6. `WebhooksPanel`: CRUD webhook + nút "gửi test".
7. `Settings`: hiện API key (copy), port, đường dẫn DB; nút regenerate key (cảnh báo).
8. Banner cảnh báo listener stopped + hướng dẫn.

## Success Criteria
- [ ] Login 6 account qua UI (QR + cookie), status đổi realtime không cần refresh.
- [ ] Nhận tin hiện ngay trong chat đang mở; gửi text + ảnh từ UI thành công.
- [ ] Scenarios: thêm/sửa/xoá/search hoạt động trong UI.
- [ ] Webhooks: thêm + "gửi test" thấy consumer nhận.
- [ ] Settings hiện đúng API key; mở Zalo Web cùng account → banner cảnh báo xuất hiện.

## Risk Assessment
- Race khi 6 QR đồng thời → mỗi card quản lý login session riêng, khoá nút khi `logging_in`.
- WS reconnect storm → backoff + chỉ 1 kết nối global.
- ~~Rò API key trong renderer → chấp nhận~~ → **KHÔNG chấp nhận nữa** (Red Team S1): xem hardening dưới.

## Red Team Hardening — Session 1 (bắt buộc)
<!-- Updated: Red Team Session 1 -->
- **[Critical] Chống stored-XSS → apiKey:** nội dung tin đến là input attacker-controlled. Render **text-only** mọi field `content`/`sender`/tên thread; **KHÔNG** `dangerouslySetInnerHTML`; validate/whitelist URL attachment (không auto-render HTML). BrowserWindow đã hardening ở P1 (`contextIsolation`/`sandbox`/`nodeIntegration:false`/CSP). Thêm acceptance: gửi payload HTML/script tới account → hiển thị dạng text, không execute.
- **[High] Tiêu thụ envelope WS discriminated** (định nghĩa ở P3): xử lý `kind: mini_event | account_status | listener_stopped`. Status realtime + banner listener-stopped dựa trên contract này (không tự đoán shape).
- **[High] Trạng thái "core down":** nghe main báo core exit/respawn → banner + disable action; auto-reconnect WS khi core sống lại.
- Không log apiKey/baseUrl ra console ở production build.

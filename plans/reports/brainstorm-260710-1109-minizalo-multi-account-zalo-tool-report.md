---
title: MiniZalo — Brainstorm Report
date: 2026-07-10
type: brainstorm
status: approved
slug: minizalo-multi-account-zalo-tool
base_lib: https://github.com/RFS-ADRENO/zca-js
modes: []
---

# MiniZalo — Brainstorm Report

Công cụ desktop open-source dựng trên `zca-js` (unofficial Zalo API): quản lý tối đa 6 tài khoản Zalo cá nhân, lưu SQLite local (Win/Mac/Linux), mở cổng REST/WebSocket/Webhook/CLI cho AI Agent & n8n, kèm bảng "tình huống cải tiến" vừa CRUD vừa cấp cho AI làm knowledge.

## 1. Problem Statement & Requirements

**Bài toán:** Cần một tool tự chạy trên máy người dùng để (a) đăng nhập & vận hành song song nhiều account Zalo cá nhân qua UI, (b) cho AI Agent/n8n tương tác (nhận/gửi tin, sau này kết bạn/nhóm/media), (c) tích luỹ kinh nghiệm xử lý tình huống dạng bảng cấp lại cho AI.

**Yêu cầu đã chốt:**

| Mục | Quyết định |
|---|---|
| Hình thái | Electron desktop app, đóng gói Win/Mac/Linux, **open-source GitHub, không host** |
| Đa account | **Tối đa 6**, cả 6 chạy listener **song song** (grid 6 ô) |
| Cổng cho AI/n8n | **REST + WebSocket + Webhook push (out) + CLI**, bind **localhost + API key tĩnh** |
| Vị trí caller | n8n chỉ là ví dụ; tool tự chạy máy người dùng → local-first |
| Bảng tình huống | Cột: Tên · Danh mục · Thực tế · Cách làm · Rút kinh nghiệm · Trạng thái. CRUD UI + **API cho AI đọc** |
| MVP vòng 1 | login QR/cookie 6 acc, gửi/nhận **text + ảnh**, webhook push, REST gửi tin, bảng tình huống CRUD+API |
| Vòng 2 | kết bạn / đồng ý kết bạn / tạo & quản lý nhóm / gửi video, file, voice |
| Bảo mật | API key tĩnh (sinh lúc cài, xem trong UI) + chỉ localhost |

**Ràng buộc nền (từ zca-js, không né được):**
- Unofficial API → **rủi ro khoá/ban account là bình thường**, phải thiết kế cùng (health-check, auto re-login QR).
- **1 web listener/account**: mở Zalo Web cùng account sẽ tắt listener → UI cảnh báo rõ.
- Zalo đổi web → zca-js có thể vỡ → cô lập trong lớp adapter, pin version.
- Gửi ảnh (zca-js v2) cần `imageMetadataGetter` → cấp metadata bằng `image-size`/sharp.

## 2. Các phương án đã đánh giá

### PA A — Electron 1 process (all-in-main)
zca-js + Fastify (REST/WS) + SQLite + webhook nằm trong Electron main; renderer = UI.
- **Ưu:** đơn giản nhất, ít code.
- **Nhược:** không chạy headless; UI và core dính nhau; khi có người dùng đòi headless/VPS phải viết lại.

### PA B — Core headless + Electron UI mỏng  ✅ ĐÃ CHỌN
Tách 1 **core Node/TS** (Fastify REST+WS, SQLite, quản lý 6 zca-js, webhook dispatcher). Electron chạy core qua `utilityProcess`; **UI là client mỏng gọi REST/WS local; CLI cũng là client REST**. Core **chạy độc lập headless** được.
- **Ưu:** 1 core → 3 mặt (UI, CLI, API từ xa) dùng chung 1 logic (DRY); headless-ready hợp bản chất open-source nhiều kiểu người dùng; CLI cho AI "miễn phí" vì chỉ là client.
- **Nhược:** thêm lớp IPC/HTTP (~15% code so với A).

**Lý do chọn B:** tool open-source phục vụ nhiều kiểu người dùng (UI-first và headless-first). B tránh nhân bản logic giữa UI/CLI/webhook; A sẽ phải đập đi làm lại khi có nhu cầu headless. Chi phí thêm nhỏ, đổi lấy khả năng mở rộng lớn.

## 3. Giải pháp khuyến nghị (PA B)

### Stack
- **TypeScript** toàn bộ · **Electron + electron-vite** · UI **React + Vite** (grid 6 account).
- **Fastify** + `@fastify/websocket` (REST + WS).
- **better-sqlite3** (đồng bộ, nhúng, không cần DB server) + migrations SQL đơn giản.
- **zca-js** cô lập sau lớp `zalo-adapter`.
- Credentials mã hoá bằng **Electron safeStorage**, lưu trong SQLite.
- Đóng gói **electron-builder** → nsis (Win) / dmg (Mac) / AppImage+deb (Linux). Native module `better-sqlite3` → cần **electron-rebuild** trong CI 3 OS.

### Cấu trúc process
```
Electron main ──spawn──> core (utilityProcess, Node/TS)
                          ├─ Fastify REST + WS  (localhost + X-API-Key)
                          ├─ zalo-adapter × ≤6  (zca-js instances)
                          ├─ better-sqlite3
                          └─ webhook dispatcher (POST ra n8n/agent)
Renderer (React UI) ──HTTP/WS──> core   (client mỏng)
CLI (minizalo)       ──HTTP──────> core   (client mỏng)
```

### Mô hình dữ liệu (SQLite)
- `accounts`(id, label, phone, status, creds_enc, avatar, last_seen, proxy?)
- `messages`(id, account_id, thread_id, thread_type, direction, sender, content, attachments_json, ts)
- `webhooks`(id, url, events, secret, enabled)
- `scenarios`(id, ten, danh_muc, thuc_te, cach_lam, rut_kinh_nghiem, trang_thai, ts)
- `settings`(api_key, ...)

### Bề mặt API MVP (header `X-API-Key`)
- **Accounts:** `GET /accounts` · `POST /accounts/:id/login/qr` (trả ảnh QR) · trạng thái login đẩy qua WS · `POST /accounts/:id/logout`
- **Messages:** `POST /accounts/:id/messages` (text/ảnh) · `GET /messages` (lịch sử) · `WS /stream` (event realtime) · webhook POST ra ngoài mỗi event (`message`, `reaction`, `undo`, `group_event`)
- **Scenarios:** `GET/POST/PUT/DELETE /scenarios` · `GET /scenarios/search?q=` (cho AI)
- **CLI (client REST):** `minizalo accounts` · `minizalo send --account A --to T --text "..."` · `minizalo listen` (tail event) · `minizalo scenario add ...`

### zca-js methods sẽ dùng (đã xác nhận tồn tại)
- MVP: `loginQR`, login cookie, `listener.on(message|reaction|undo|group_event)`, `sendMessage` (text + attachments ảnh).
- Vòng 2: `sendFriendRequest`, `acceptFriendRequest`, `getAllFriends`, `changeFriendAlias`; `createGroup`, `addUserToGroup`, `removeUserFromGroup`, `getGroupInfo`, `getAllGroups`, đổi tên/avatar/owner, deputy; `sendVoice`, `sendCard`, video/file qua attachments.

## 4. Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Ban/khoá account | Health-check định kỳ + phát hiện account chết + nút re-login QR; coi là trạng thái bình thường |
| zca-js breaking khi Zalo đổi web | Cô lập trong `zalo-adapter`, pin version, dễ vá 1 chỗ |
| Gửi ảnh v2 cần `imageMetadataGetter` | Dùng `image-size`/sharp cấp metadata |
| Native module packaging (better-sqlite3) | electron-rebuild trong CI build 3 OS |
| 6 listener tốn RAM | Lazy-start theo account bật; cảnh báo UI |
| Mở Zalo Web cùng account → tắt listener | Cảnh báo rõ trên UI; ưu tiên account "thuộc về" app |
| API key lộ (local) | Bind localhost, key trong safeStorage, hiện trong UI để copy |

## 5. Tiêu chí nghiệm thu MVP

Cài được trên Win/Mac/Linux → login đồng thời 6 account (QR/cookie) → nhận tin từ Zalo hiện realtime trên UI + đẩy webhook ra URL cấu hình → gọi REST/CLI gửi **text + ảnh** thành công → thêm/sửa/xoá tình huống trong UI và đọc được qua `GET /scenarios` + `GET /scenarios/search`.

## 6. Next steps & phụ thuộc

1. `/ck:plan` chia phase: (P1) scaffold Electron+core+SQLite migrations; (P2) zalo-adapter + login 6 account + UI grid; (P3) listener → WS/webhook + REST gửi text/ảnh; (P4) bảng scenarios CRUD+API+search; (P5) CLI client; (P6) đóng gói electron-builder 3 OS + CI electron-rebuild.
2. Phụ thuộc ngoài: `zca-js` (pin version), `better-sqlite3`, `fastify`, `electron`, `electron-vite`, `electron-builder`, `image-size`/sharp.
3. Vòng 2 sau MVP: friend/group/video/file/voice.

## Unresolved questions
- Chưa chốt ORM: khuyến nghị `better-sqlite3` thuần + migrations SQL (KISS) thay vì Drizzle — xác nhận khi plan.
- Retention của bảng `messages` (lưu bao lâu / giới hạn dòng) — quyết ở phase P3.
- Proxy per-account có làm ngay MVP không (zca-js hỗ trợ) — mặc định để vòng 2 trừ khi cần.
- Tên package/CLI (`minizalo`?) và license (MIT?) — xác nhận trước khi publish.

---
phase: 3
title: "Messaging webhook & realtime"
status: pending
effort: ""
priority: P1
dependencies: [2]
---

# Phase 3: Messaging webhook & realtime

## Overview
Nối listener zca-js → lưu message → phát realtime (WS `/stream`) + đẩy webhook ra ngoài; REST gửi text+ảnh. Kết thúc phase: tin đến chảy tới WS + webhook; gọi REST gửi được text+ảnh.

## Requirements
- Functional: listener events `message`, `reaction`, `undo`, `group_event` cho mọi account online; lưu vào `messages`; broadcast WS; POST webhook tới URL cấu hình (retry cơ bản); REST gửi `text` + `image` tới user/group thread.
- Non-functional: gửi ảnh dùng `imageMetadataGetter` (zca-js v2); webhook không chặn luồng listener (fire-and-forget + retry queue nhẹ); **lưu toàn bộ message, KHÔNG cắt/retention** (Validation S1 — chấp nhận DB phình đổi lấy full history cho AI/audit). <!-- Updated: Validation Session 1 - retention removed, store all -->

DB layer: `better-sqlite3` thuần + SQL viết tay (Validation S1, không ORM).

## Architecture
- `core/zalo/listener-bridge.ts`: với mỗi account online, `startListener()` + `on(event)` → chuẩn hoá thành `MiniEvent {accountId, type, threadId, threadType, sender, content, attachments, ts}` → đẩy vào `event-bus`.
- `core/event-bus.ts`: EventEmitter trung tâm; consumer: (a) db writer, (b) ws broadcaster, (c) webhook dispatcher.
- `core/webhook/dispatcher.ts`: đọc `webhooks` enabled, filter theo `events`, POST JSON kèm HMAC `secret` header; retry x3 backoff; log fail.
- `core/server/ws.ts`: `@fastify/websocket` `/stream` — auth bằng **message đầu tiên `{apiKey}`** (không đặt apiKey trên query string, tránh rò log — Validation S1); broadcast MiniEvent; hỗ trợ filter theo accountId (gửi trong message subscribe).
- `core/server/routes/messages.ts`: `POST /accounts/:id/messages` body `{to, threadType, text?, imagePath?/imageBase64?}` → adapter `sendMessage` (attachments ảnh); `GET /messages?accountId=&threadId=&limit=`.
- `core/zalo/media.ts`: build image attachment + `imageMetadataGetter` dùng `image-size`.

## Related Code Files
- Create: `core/zalo/listener-bridge.ts`, `core/event-bus.ts`, `core/webhook/dispatcher.ts`, `core/zalo/media.ts`
- Create: `core/server/ws.ts`, `core/server/routes/messages.ts`, `core/server/routes/webhooks.ts`
- Modify: `core/zalo/account-manager.ts` (start/stop listener theo status), `core/index.ts` (wire event-bus consumers), `core/db/migrations/001-init.ts` (messages, webhooks cols)

## Implementation Steps
1. `event-bus` + đăng ký 3 consumer (db, ws, webhook) lúc bootstrap.
2. `listener-bridge`: account `online` → startListener, map 4 event → MiniEvent → emit; account `dead/logout` → stopListener.
3. DB writer: insert `messages` (direction=in), **lưu toàn bộ, không xoá** (Validation S1).
4. WS `/stream`: auth, subscribe, broadcast; test 2 client nhận song song.
5. Webhook: routes CRUD `webhooks`; dispatcher POST + HMAC + retry; direction=out cho tin gửi cũng phát event.
6. `media.ts` + `POST .../messages`: gửi text; gửi ảnh (path hoặc base64) qua `imageMetadataGetter`; ghi `messages` direction=out.
7. Test end-to-end: nhắn từ điện thoại → thấy ở WS + webhook nhận; gọi REST gửi ảnh → nhận trên Zalo.

## Success Criteria
- [ ] Tin đến từ 1 account hiện trên WS client < 2s và webhook nhận POST hợp lệ (HMAC verify pass).
- [ ] `POST /accounts/:id/messages` gửi **text** thành công tới user thread và group thread.
- [ ] Gửi **ảnh** (base64 và path) thành công, hiển thị đúng trên Zalo.
- [ ] Webhook fail (URL sai) → retry 3 lần rồi log, không sập listener.
- [ ] `GET /messages` trả lịch sử đúng filter (paginate, không cắt dữ liệu cũ).

## Risk Assessment
- Mở Zalo Web cùng account → listener tự tắt → phát event `account:listener_stopped`, UI cảnh báo (P5).
- `imageMetadataGetter` sai kích thước → ảnh lỗi; validate bằng `image-size` trước gửi.
- Webhook đẩy PII ra ngoài → tài liệu hoá; secret HMAC bắt buộc để consumer verify.
- Event bão hoà (spam) → có thể cần rate-limit/queue; MVP log cảnh báo, tối ưu sau.
- DB phình vô hạn (lưu toàn bộ, Validation S1) → chấp nhận cho MVP; công cụ dọn/nén thủ công + cảnh báo dung lượng là việc vòng sau (YAGNI).

## Red Team Hardening — Session 1 (bắt buộc)
<!-- Updated: Red Team Session 1 -->
- **[Critical] Disk-full watchdog (dù lưu-mãi-mãi):** monitor dung lượng; ngưỡng cảnh báo UI; khi gần đầy **từ chối ghi message mới** NHƯNG vẫn cho ghi `settings`/`accounts` (đừng để disk-full chặn lưu creds/re-login). **Lưu bytes ảnh ra filesystem** (`userData/media/`), DB chỉ giữ đường dẫn — không nhét blob vào row.
- **[Critical] WS auth state machine:** socket connect → `authed=false` + timer ~5s, không auth thì close; **broadcaster/subscribe BỎ QUA mọi socket `authed=false`** (không rò MiniEvent/PII cho socket chưa auth); sai key → close code xác định. Thêm success criterion: socket chưa auth nhận 0 event và bị đóng.
- **[High] Origin allowlist + CORS deny-by-default:** verify `Origin` lúc WS upgrade + REST (chặn DNS-rebinding từ tab trình duyệt cùng máy). Auth key ngay lúc WS **upgrade**, không phải sau khi accept.
- **[High] Envelope WS discriminated (freeze TRƯỚC P5):** một khung thống nhất `{kind:'mini_event'|'account_status'|'listener_stopped', ...}` phủ cả event message-domain (message/reaction/undo/group_event) LẪN lifecycle account (P2 EventEmitter bridge lên WS). P5 phụ thuộc contract này → chốt ở đây.
- **[High] Webhook tối giản MVP:** **single POST + log fail, KHÔNG retry-queue, KHÔNG HMAC** (defer vòng 2 — tránh OOM do queue vô hạn + giảm phức tạp). **Enforce `https`** + **SSRF guard** chặn IP private/loopback/link-local (re-check sau DNS resolve). Secret (khi thêm HMAC vòng 2) mã hoá như creds.
- **[High] Chỉ map `message` cho MVP listener:** reaction/undo/group_event để vòng 2 (giảm bề mặt coupling zca-js — rủi ro số 1). Acceptance MVP chỉ kiểm inbound message + outbound text/ảnh.
- **[High] `imageBase64` cần ghi temp file** rồi truyền path (vì `imageMetadataGetter`/attachment cần filePath), cleanup sau gửi. Thêm tiêu chí gửi ảnh **group thread** riêng (không coi mặc định giống user thread).
- **[High] SQL an toàn:** mọi query dùng `.prepare()` bound params (không nối chuỗi); insert message **batched trong 1 transaction** theo timer/ngưỡng để giảm chi phí sync chặn event loop. Tách ingestion khỏi persistence bằng queue bounded để DB stall không chặn WS/REST.
- **[Medium] AI confused-deputy:** document rủi ro prompt-injection khi agent `listen`→`send`; cân nhắc allowlist/confirm thread đích cho outbound send (vòng sau).

---
title: Spike — zca-js API contract verification
date: 2026-07-10
type: spike
plan: 260710-1109-minizalo-electron-multi-account-zalo-tool
zca_js_version: (installed latest, see package-lock)
---

# Spike: zca-js API contract (resolve Red Team #2/#8/#9)

Introspect types thật của `zca-js` (dist .d.ts). Kết quả: mọi hợp đồng plan cần đều xác nhận. Không còn unresolved chặn P2/P3.

## Xác nhận

- **`new Zalo(options?)`** — `Options`: `selfListen, checkUpdate, logging, apiType, apiVersion, agent?(proxy), polyfill, imageMetadataGetter?`. → `imageMetadataGetter` là **ctor-level** (#8 đúng): `(filePath) => Promise<{width,height,size}|null>`.
- **`zalo.loginQR({userAgent?, qrPath?}, callback?)`** → `Promise<API>` (resolve SAU khi quét). Callback `LoginQRCallbackEvent`:
  - `QRCodeGenerated` → `data.image` (**QR base64**), `data.code`.
  - `QRCodeScanned` → `{avatar, display_name}`.
  - `GotLoginInfo` → `{cookie: SerializedCookie[], imei, userAgent}` ← **capture để persist session**.
  - `QRCodeExpired`, `QRCodeDeclined`; `actions.retry/abort`.
- **`zalo.login(credentials)`** (public; = cookie login) → `Promise<API>`. `Credentials = {imei, cookie, userAgent, language?}`. → **session restore khả thi** (#9 RESOLVED). Cũng có `api.getContext()` → ContextSession, `api.getCookie()` → CookieJar.
- **`api.sendMessage(message, threadId, type?)`**: `message = string | MessageContent`; `MessageContent.attachments = AttachmentSource | AttachmentSource[]`; `AttachmentSource = string(filePath) | {data:Buffer, filename, metadata}`. → gửi ảnh bằng **đường dẫn file** (base64 → ghi temp file → path). `ThreadType.User=0, Group=1`.
- **`api.listener`** = `EventEmitter` events: `connected, disconnected(code,reason), closed(code,reason), error, message, reaction, undo, friend_event, group_event, typing, seen_messages, delivered_messages, old_messages`... `.start({retryOnClose})`, `.stop()`, `.requestOldMessages()`.
- **`CloseReason`**: `ManualClosure=1000, AbnormalClosure=1006, DuplicateConnection=3000, KickConnection=3003`.

## Tác động thiết kế (cập nhật plan)

1. **#9 resolved** — giữ "session persist qua restart" trong acceptance. Persist `{imei, cookie, userAgent}` lấy từ `GotLoginInfo`.
2. **Health-check (#11) đơn giản & an toàn hơn:** dùng **passive** listener `disconnected/closed` + `CloseReason` để phân biệt:
   - `DuplicateConnection(3000)/KickConnection(3003)` → mở Zalo Web nơi khác / bị kick → cảnh báo, không coi là `dead` do lỗi.
   - `AbnormalClosure(1006)` + retry fail → transient.
   - auth-invalid (login/relogin throw `ZaloApiError`) → `dead` + re-login QR.
   → **bỏ active `getOwnId` polling** (giảm traffic gây ban). `listener.start({retryOnClose:true})` tự retry.
3. **QR flow (#2):** `POST /accounts/:id/login/qr` khởi động `loginQR` nền, trả `data.image` từ `QRCodeGenerated` ngay; đẩy `account_status` online khi Promise resolve / `GotLoginInfo`.
4. **Errors dùng được:** `ZaloApiError, ZaloApiLoginQRAborted, ZaloApiLoginQRDeclined, ZaloApiMissingImageMetadataGetter`.

## Unresolved còn lại
- Chưa test login THẬT (cần điện thoại quét QR) — chỉ verify type. Sẽ xác nhận runtime khi có tài khoản test.

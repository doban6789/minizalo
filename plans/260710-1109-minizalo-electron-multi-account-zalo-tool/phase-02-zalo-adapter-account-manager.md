---
phase: 2
title: Zalo adapter & account manager
status: completed
effort: ''
priority: P1
dependencies:
  - 1
---

# Phase 2: Zalo adapter & account manager

## Overview
Lớp `zalo-adapter` cô lập `zca-js` + account manager quản lý vòng đời ≤6 account song song: login QR/cookie, persist session, health-check, re-login. Kết thúc phase: login được 6 account thật đồng thời, restart giữ session.

## Requirements
- Functional: login QR (trả ảnh QR base64), login cookie (imei+cookies+userAgent); lưu credentials mã hoá; auto khôi phục session lúc start; phát hiện account chết → status `dead` + cho re-login; hard cap 6.
- Non-functional: mỗi account 1 instance zca-js độc lập; lỗi 1 account không sập core; toàn bộ zca-js gọi qua adapter (không import zca-js nơi khác). Cột `accounts.proxy` giữ nullable như chỗ dành sẵn nhưng **KHÔNG dùng ở MVP** (proxy per-account là vòng 2 — Validation S1). <!-- Updated: Validation Session 1 - proxy deferred to round 2 -->

## Architecture
- `core/zalo/zalo-adapter.ts`: bọc `zca-js` — hàm `loginQR()`, `loginCookie(creds)`, `getApi()`, `startListener()`, `stopListener()`, `logout()`. Chỉ file này biết API zca-js → dễ vá khi Zalo đổi.
- `core/zalo/account-manager.ts`: `Map<accountId, AdapterInstance>`; `list()`, `add()`, `startLogin(mode)`, `restoreAll()`, `remove()`; enforce cap 6; emit event `account:status` (EventEmitter) cho server/WS.
- `core/zalo/session-store.ts`: đọc/ghi `accounts.creds_enc` qua safeStorage; serialize context zca-js (cookie/imei/ua).
- Health-check: interval ping (thử gọi API nhẹ vd `getOwnId`/fetch self); fail N lần → status `dead`.
- Trạng thái account: `logged_out | qr_pending | online | dead | logging_in`.

## Related Code Files
- Create: `core/zalo/zalo-adapter.ts`, `core/zalo/account-manager.ts`, `core/zalo/session-store.ts`, `core/zalo/types.ts`
- Create: `core/server/routes/accounts.ts` (REST accounts)
- Modify: `core/index.ts` (khởi tạo account-manager + restoreAll), `core/db/migrations/001-init.ts` (đảm bảo cột accounts: id,label,phone,status,creds_enc,avatar,last_seen,proxy)

## Implementation Steps
1. Cài `zca-js` (pin version), viết `zalo-adapter` bọc login QR/cookie + listener start/stop.
2. `session-store`: sau login thành công, lấy context (cookie/imei/ua) → encrypt → `accounts.creds_enc`.
3. `account-manager`: add/list/remove, cap 6; `restoreAll()` đọc accounts có creds → loginCookie im lặng lúc start.
4. REST routes: `GET /accounts`, `POST /accounts` (tạo slot + label), `POST /accounts/:id/login/qr` (start QR, trả ảnh), `POST /accounts/:id/login/cookie`, `POST /accounts/:id/logout`, `DELETE /accounts/:id`.
5. QR flow: adapter trả QR image + resolve khi user quét xong → update status `online`, lưu session. Tiến trình đẩy qua event (WS ở P3; tạm thời poll `GET /accounts/:id`).
6. Health-check interval + đánh dấu `dead`; `POST /accounts/:id/login/qr` dùng lại để re-login.
7. Xử lý lỗi từng account bằng try/catch, log có accountId, không throw lên core.

## Success Criteria
- [ ] Login 6 account thật đồng thời (mix QR + cookie), tất cả `online`.
- [ ] Restart app → `restoreAll` đưa lại `online` không cần quét QR (nếu session còn hạn).
- [ ] Thêm account thứ 7 → API trả 409/400 "max 6".
- [ ] Kill mạng 1 account → health-check chuyển `dead`, các account khác vẫn `online`.
- [ ] `grep -r "zca-js" core/` chỉ khớp trong `core/zalo/` (cô lập đạt).

## Risk Assessment
- Session hết hạn/không phục hồi được → UI hiển thị `dead` + nút re-login QR (chấp nhận, đúng bản chất unofficial).
- Login QR là async có timeout → set timeout hợp lý, cho phép huỷ.
- zca-js đổi chữ ký hàm giữa version → pin + adapter cô lập; ghi version trong README.
- Nhiều listener/account đồng thời tốn RAM → lazy-start listener theo account bật (chi tiết P3).

## Red Team Hardening — Session 1 (bắt buộc)
<!-- Updated: Red Team Session 1 -->
- **[Critical] Sửa hợp đồng `loginQR`:** zca-js `loginQR({userAgent, qrPath})` trả **1 Promise chỉ resolve SAU khi quét**, QR giao qua file `qrPath` / callback `(qrPath)=>{}` — KHÔNG "trả base64 ngay". → chạy `loginQR` ở background, bắt QR qua callback → đọc PNG → base64 trả về caller ngay; đẩy chuyển `online` qua event/WS khi Promise resolve. Viết lại step 5.
- **[High] Verify session-restore trước khi dựa vào:** cookie login cần `{cookie, imei, userAgent}` khớp session gốc. **Spike zca-js thật** xác nhận method export cookie-jar + imei + UA từ instance live; capture đúng imei/UA lúc QR-login để persist. Nếu không export được → bỏ "session persist qua restart" khỏi acceptance MVP.
- **[High] `imageMetadataGetter` là option lúc `new Zalo({imageMetadataGetter})`** (dùng `image-size`), KHÔNG gọi per-send. Cấu hình tại adapter này (không ở media.ts P3).
- **[High] Health-check chống false-positive:** phân biệt **transient/unreachable** (retry, GIỮ listener, recovery mũ) vs **auth-invalid** (chỉ cái này set `dead`). Stagger + jitter + rate-limit probe 6 account; ưu tiên **passive liveness** (last-event time) hơn active probe (giảm traffic gây ban); khi hồi phục auto re-arm listener KHÔNG cần QR lại.
- **[High] restoreAll isolate per-account:** mỗi account decrypt/login trong try/catch riêng; 1 account lỗi (decrypt lệch scheme / session hết hạn) → set `dead` account đó, KHÔNG throw làm hỏng restore/boot.
- **[High] Supply-chain zca-js:** commit lockfile, cài bằng `npm ci`, `npm audit`/OSV trong CI, pin theo integrity hash (zca-js cầm raw cookie → 1 publish độc = takeover toàn bộ). Ghi rõ rủi ro trong README.

### ✅ Spike resolution (2026-07-10) — `plans/reports/spike-260710-1148-zca-js-api-contract-verification-report.md`
- **#9 session-restore GIẢI QUYẾT:** bắt `GotLoginInfo` từ `loginQR` callback = `{cookie,imei,userAgent}` → persist → khôi phục bằng `zalo.login({imei,cookie,userAgent})`. Giữ "persist qua restart".
- **Health-check → PASSIVE:** bỏ active `getOwnId` poll; dùng listener `closed/disconnected` + `CloseReason` (Duplicate=3000/Kick=3003 = mở nơi khác; 1006=transient; login throw `ZaloApiError`=dead). `listener.start({retryOnClose:true})`.
- QR: `loginQR` callback `QRCodeGenerated.data.image` = QR base64 trả ngay; `online` khi Promise resolve.

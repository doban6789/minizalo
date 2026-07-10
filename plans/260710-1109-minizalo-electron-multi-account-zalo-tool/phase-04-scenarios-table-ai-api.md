---
phase: 4
title: Scenarios table & AI API
status: completed
effort: ''
priority: P2
dependencies:
  - 1
---

# Phase 4: Scenarios table & AI API

## Overview
Bảng "tình huống cải tiến" — schema + REST CRUD + endpoint search cho AI đọc làm knowledge. Độc lập P2/P3, chỉ cần P1. Kết thúc phase: CRUD đầy đủ + search text hoạt động.

## Requirements
- Functional: cột `ten` (Tên tình huống), `danh_muc` (Danh mục), `thuc_te` (Thực tế), `cach_lam` (Cách tôi làm), `rut_kinh_nghiem` (Tóm tắt & rút kinh nghiệm), `trang_thai` (Trạng thái); CRUD; `GET /scenarios/search?q=` cho AI (khớp text nhiều cột).
- Non-functional: search đơn giản, hiệu quả — dùng SQLite FTS5 nếu bật được, fallback LIKE; trạng thái là enum cấu hình (vd `mới | đang xử lý | đã xong | bỏ`).

## Architecture
- `core/db/migrations/002-scenarios.ts`: bảng `scenarios(id, ten, danh_muc, thuc_te, cach_lam, rut_kinh_nghiem, trang_thai, created_ts, updated_ts)` + (tuỳ) FTS5 virtual table `scenarios_fts` mirror qua trigger.
- `core/server/routes/scenarios.ts`: `GET /scenarios` (filter danh_muc/trang_thai, paginate), `POST`, `PUT /:id`, `DELETE /:id`, `GET /scenarios/search?q=&limit=`.
- `core/scenarios/service.ts`: logic CRUD + search; search trả kèm `snippet`/rank để AI dùng few-shot.
- Response search tối ưu cho AI: `[{ten,danh_muc,cach_lam,rut_kinh_nghiem,trang_thai,score}]`.

## Related Code Files
- Create: `core/db/migrations/002-scenarios.ts`, `core/scenarios/service.ts`, `core/server/routes/scenarios.ts`
- Modify: `core/db/migrations/index.ts` (đăng ký 002), `core/server/app.ts` (mount routes)

## Implementation Steps
1. Migration 002: bảng scenarios + thử FTS5 (`CREATE VIRTUAL TABLE ... USING fts5`); nếu build sqlite không có FTS5 → cờ fallback LIKE.
2. `service.ts`: create/update (auto updated_ts), delete, list (filter+paginate), search (FTS5 MATCH hoặc LIKE nhiều cột).
3. Routes + validation (Fastify schema: bắt buộc `ten`; `trang_thai` trong enum).
4. Trigger sync FTS (nếu dùng) trên insert/update/delete.
5. Seed 2-3 tình huống mẫu (dev only) để test search.
6. Test: CRUD + search khớp theo `thuc_te`/`cach_lam`/`rut_kinh_nghiem`.

## Success Criteria
- [ ] CRUD đầy đủ qua REST (tạo/sửa/xoá/list) với `X-API-Key`.
- [ ] `trang_thai` ngoài enum → 400.
- [ ] `GET /scenarios/search?q=` trả kết quả liên quan xếp theo độ khớp; rỗng khi không match.
- [ ] Filter `danh_muc` + `trang_thai` + paginate hoạt động.
- [ ] Fallback LIKE chạy đúng khi FTS5 không có.

## Risk Assessment
- FTS5 không có sẵn trong bản better-sqlite3 đóng gói → fallback LIKE (đã thiết kế); ghi rõ hạn chế.
- Search chất lượng thấp cho AI → MVP đủ dùng; nâng cấp embedding/vector là vòng sau (YAGNI).
- Ai (AI) ghi bừa qua API → trạng thái enum + validation; không auto-execute gì từ bảng này.

## Red Team Hardening — Session 1 (bắt buộc)
<!-- Updated: Red Team Session 1 -->
- **[High] LIKE-only cho MVP, BỎ dual FTS5:** better-sqlite3 prebuilt vốn có FTS5 → nhánh fallback là phantom risk + tạo contract lệch (`score`/`snippet` khác nhau). MVP dùng **1 đường LIKE nhiều cột**, `score` = match count đơn giản, `snippet` optional. Bỏ virtual table + trigger + detection (KISS/DRY). Thêm FTS5 chỉ khi corpus đủ lớn làm LIKE chậm.
- **[High] Parameterized bắt buộc:** mọi search/CRUD dùng `.prepare()` bound params; escape token; không nối chuỗi `q` vào SQL (chống injection qua REST/CLI).
- **[Medium] Contract response ổn định:** cả path (nếu sau này thêm FTS5) phải trả cùng shape `[{...,score}]` để AI few-shot không vỡ.

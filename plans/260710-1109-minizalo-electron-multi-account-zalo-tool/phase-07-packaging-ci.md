---
phase: 7
title: "Packaging & CI"
status: pending
effort: ""
priority: P2
dependencies: [5, 6]
---

# Phase 7: Packaging & CI

## Overview
Đóng gói app Win/Mac/Linux qua electron-builder (giải quyết native better-sqlite3) + GitHub Actions build 3 OS + README/docs cho người dùng open-source. Kết thúc phase: có artifact cài đặt + repo publish-ready.

## Requirements
- Functional: build installer nsis (Win), dmg (Mac), AppImage+deb (Linux); better-sqlite3 rebuild đúng ABI Electron; CI tự build khi tag release; artifact đính vào GitHub Release.
- Non-functional: README hướng dẫn cài + cảnh báo rủi ro ban account; **license MIT** + package/CLI tên **`minizalo`** (chốt Validation S1); không commit secret. <!-- Updated: Validation Session 1 - MIT + minizalo confirmed -->

## Architecture
- `electron-builder.yml`: targets 3 OS; `asarUnpack` cho native module; `files` gồm core+ui dist + cli.
- `@electron/rebuild` (hoặc `electron-builder` install-app-deps) rebuild better-sqlite3 theo Electron version.
- `.github/workflows/build.yml`: matrix `windows/macos/ubuntu`, cache, `npm run build`, `electron-builder --publish never` (upload artifact); job release khi tag `v*`.
- Docs: `docs/deployment-guide.md`, `docs/system-architecture.md`, cập nhật `README.md`.

## Related Code Files
- Create: `electron-builder.yml`, `.github/workflows/build.yml`
- Create: `docs/system-architecture.md`, `docs/deployment-guide.md`, `LICENSE`
- Modify: root `package.json` (scripts build/dist, electron-builder devDep), `README.md` (đầy đủ)

## Implementation Steps
1. Script build: bundle core (tsc/esbuild) + ui (vite build) + cli; electron-vite build.
2. `electron-builder.yml`: 3 target, asarUnpack better-sqlite3, icon, appId.
3. Rebuild native: `electron-builder install-app-deps` trong postinstall/CI.
4. Build cục bộ từng OS khả dụng → chạy thử artifact (ít nhất Linux AppImage trong môi trường này).
5. CI matrix 3 OS + upload artifacts; job release đính vào GitHub Release khi tag.
6. README: mô tả, cài đặt, cấu hình webhook/API key, ví dụ AI Agent + CLI, **cảnh báo ban account & disclaimer unofficial**, license.
7. `docs/`: kiến trúc + deployment.

## Success Criteria
- [ ] Build ra installer Win (.exe), Mac (.dmg), Linux (.AppImage + .deb).
- [ ] App đóng gói khởi động, core chạy, better-sqlite3 nạp không lỗi ABI.
- [ ] CI matrix 3 OS xanh; tag `v*` tạo Release kèm artifact.
- [ ] README + docs đầy đủ, có disclaimer rủi ro + license.
- [ ] Không có secret/token trong repo.

## Risk Assessment
- Native ABI mismatch → dùng `install-app-deps`; pin Electron + Node version (`.nvmrc`).
- Mac cần code-sign/notarize để chạy mượt → MVP để unsigned + hướng dẫn "mở dù cảnh báo"; notarize là bước sau.
- CI mac/win runner tốn phút → chỉ build full khi tag, PR chỉ build Linux.
- electron-builder cache lệch → clean cache khi đổi Electron version.

## Red Team Hardening — Session 1 (bắt buộc)
<!-- Updated: Red Team Session 1 -->
- **[High] Supply-chain trong CI:** commit lockfile; cài bằng **`npm ci`** (không `npm install`); chạy **`npm audit`/OSV**; cân nhắc `--ignore-scripts` chỗ an toàn; pin zca-js theo integrity hash. zca-js cầm raw cookie → 1 publish độc = takeover; README ghi rõ.
- **[Medium] Validate native module sớm:** build 1 target trên OS dev (vd Linux AppImage) + chạy thử để xác nhận `better-sqlite3` nạp đúng ABI TRƯỚC khi tốn phút runner mac/win cho full matrix. Full matrix 3 OS giữ nguyên (yêu cầu cross-platform), chỉ đổi thứ tự để bắt lỗi ABI rẻ.

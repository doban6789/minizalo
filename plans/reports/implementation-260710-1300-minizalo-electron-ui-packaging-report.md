# Implementation Report — MiniZalo Electron UI + Packaging (P5, P7)

Date: 2026-07-10
Branch: `feat/minizalo-core`
Commit: `feat: add Electron UI and cross-platform packaging`

## Scope

Completed final two phases of the MiniZalo MVP:
- **P5** — Electron app (main + preload + React renderer)
- **P7** — electron-builder packaging, GitHub Actions CI, README, LICENSE, docs

Core (P1–P4) and CLI (P6) were completed and committed earlier.

## What was built

### P5 — Electron + UI
- `src/main/index.ts` — runs `@minizalo/core` **in the main process** (deviation from the
  plan's `utilityProcess`; required because `safeStorage` is main-only — Red Team #1).
  Listens on ephemeral loopback port, writes `~/.minizalo/config.json` (0600, atomic),
  calls `core.restore()`. Hardened `BrowserWindow` (contextIsolation, sandbox,
  nodeIntegration:false, external-link handler).
- `src/main/safe-storage-crypto.ts` — `SafeStorageCryptoProvider` (scheme `mzss1:`);
  `persistent = safeStorage.isEncryptionAvailable()` → session-only, no plaintext, if the
  OS has no keyring (Red Team #3).
- `src/preload/index.ts` — `contextBridge` exposing only `getConfig()`.
- `src/renderer/**` — React 19 UI: `AccountsTab` (≤6 grid, QR login modal), `ChatPanel`
  (**plain-text** message render — no `dangerouslySetInnerHTML`, Red Team #4),
  `ScenariosTab`, `WebhooksTab`, `SettingsTab`. `App.tsx` consumes the discriminated WS
  envelope (`account_status` / `listener_stopped` / `core_status`) with banners for
  listener-stopped and core-down. CSP restricts `connect-src` to loopback.
- `electron.vite.config.ts` — main/preload/renderer with `externalizeDepsPlugin` (native
  deps stay external) + react. **Preload forced to CommonJS `index.cjs`** — a sandboxed
  preload cannot be ESM.
- `tsconfig.electron.json` — DOM + node libs, `react-jsx`, for typechecking main/preload/renderer.

### P7 — Packaging & CI
- `electron-builder.yml` — appId `vn.binhvuong.minizalo`; targets nsis / dmg / AppImage+deb;
  `asarUnpack` for the native `better-sqlite3` binding; `npmRebuild: true`.
- `.github/workflows/build.yml` — `check` (npm ci + `npm audit --omit=dev --audit-level=high`
  + build core + typecheck + test), `build-linux` (ABI validation on the cheapest runner
  first), `release` (3-OS matrix + GitHub Release on `v*` tags).
- `README.md`, `LICENSE` (MIT), `docs/system-architecture.md`, `docs/deployment-guide.md`.
- Root scripts: `build:core` wired as `predev`/`precompile`; `dist:*` route through `compile`
  so the core is always compiled before the Electron main imports it.

## Verification

- `npm run typecheck` — clean across core, cli, and Electron/renderer.
- `npm test` — 23/23 pass (16 core + 7 cli).
- `npm run compile` — main (`out/main/index.js`), preload (`out/preload/index.cjs`), renderer
  (`out/renderer/index.html`) all build; core emits `core/dist`.

## Not verifiable in this environment

The sandbox has no display and cannot download the Electron binary, so these need the user's
real machine:
- `npm run dev` — live desktop UI.
- Real Zalo QR login for up to 6 accounts (needs a phone).
- `electron-builder` installer output + `better-sqlite3` ABI load in the packaged app
  (the CI `build-linux` job validates this on GitHub-hosted runners).

## Deviations from plan

- Core runs in the Electron **main process**, not a `utilityProcess` (safeStorage constraint).
  Plan overview updated to match.

## Unresolved questions

- App icons are not yet provided (`build/icon.*` commented out in `electron-builder.yml`);
  installers will use Electron defaults until icons are added.
- macOS builds are unsigned for the MVP; notarization is deferred.

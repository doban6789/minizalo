# Deployment & Packaging Guide

How to build, package, and release MiniZalo installers.

## Prerequisites

- Node.js — version pinned in [`.nvmrc`](../.nvmrc). Use `nvm use`.
- A C/C++ build toolchain (for the native `better-sqlite3` module):
  - **Linux:** `build-essential`, `python3`
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`)
  - **Windows:** "Desktop development with C++" (Visual Studio Build Tools)

## Local development

```bash
npm ci        # install + postinstall rebuilds better-sqlite3 for Electron's ABI
npm run dev   # electron-vite dev — hot-reloading desktop app
```

Useful workspace scripts:

```bash
npm run build:core   # compile the core (tsc → core/dist)
npm run typecheck    # core + cli + electron/renderer typecheck
npm test             # run core + cli test suites
npm run compile      # electron-vite build → out/{main,preload,renderer}
```

## Building installers

```bash
npm run dist          # current OS
npm run dist:linux    # AppImage + deb
npm run dist:win      # NSIS .exe
npm run dist:mac      # .dmg
```

Output lands in `release/`. Config is [`electron-builder.yml`](../electron-builder.yml).

### Native module (better-sqlite3)

`better-sqlite3` is compiled against Electron's V8 ABI, **not** system Node. Two safeguards:

1. `postinstall` runs `electron-builder install-app-deps` (rebuilds after `npm ci`).
2. `electron-builder.yml` sets `npmRebuild: true` and `asarUnpack`s the `.node` binding so it
   loads from disk rather than the asar archive.

If you hit `NODE_MODULE_VERSION` / ABI errors at runtime, re-run
`npx electron-builder install-app-deps` and rebuild.

> **Sandbox note:** this repo's CI/dev sandbox cannot launch a desktop GUI or download the
> Electron binary, so the packaged app and live Zalo login are **verified on a real machine**,
> not here. `npm run typecheck` and `npm run compile` (bundling) do pass in-sandbox.

## macOS: unsigned builds

The MVP ships **unsigned** (no Apple Developer code-signing / notarization). Users will see
"MiniZalo can't be opened because Apple cannot check it for malicious software." To open:

1. Right-click the app → **Open** → **Open** again, **or**
2. System Settings → Privacy & Security → **Open Anyway**.

Signing + notarization is a later step (needs an Apple Developer ID).

## CI / Release

[`.github/workflows/build.yml`](../.github/workflows/build.yml):

- **`check`** (every push/PR): `npm ci`, `npm audit --omit=dev --audit-level=high`, build core,
  typecheck, test.
- **`build-linux`** (every push/PR): compiles and builds the Linux AppImage/deb to validate the
  native module's ABI on the cheapest runner first.
- **`release`** (only on `v*` tags): matrix build on ubuntu/windows/macos and publish installers
  to a GitHub Release via `electron-builder --publish always` (`GITHUB_TOKEN`).

### Cutting a release

```bash
# bump version in package.json, commit, then:
git tag v0.1.0
git push origin v0.1.0
```

The tag triggers the `release` job; installers attach to the GitHub Release automatically.

## Supply-chain hygiene

- Commit `package-lock.json`; CI installs with **`npm ci`** (never `npm install`).
- `zca-js` handles raw Zalo cookies — a poisoned release is an account-takeover vector. Review
  dependency updates; keep versions pinned via the lockfile's integrity hashes.
- Never commit `~/.minizalo/config.json`, the SQLite DB, or `.env` files (see `.gitignore`).

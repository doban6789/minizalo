import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { createCore, type RunningCore } from 'minizalo-core';
import { SafeStorageCryptoProvider } from './safe-storage-crypto.js';

/**
 * MiniZalo Electron main. The headless core runs IN THIS PROCESS (main has
 * safeStorage — Red Team #1), listening on an ephemeral loopback port. The
 * renderer (UI) is a separate process that talks to the core over REST/WS using
 * the baseUrl+apiKey handed to it via the preload bridge.
 */
let core: RunningCore | null = null;
let mainWindow: BrowserWindow | null = null;
let connInfo: { baseUrl: string; apiKey: string } | null = null;

const isDev = !!process.env.ELECTRON_RENDERER_URL;

function writeCliConfig(baseUrl: string, port: number, apiKey: string, nonce: string): void {
  const dir = join(homedir(), '.minizalo');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'config.json');
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify({ baseUrl, port, apiKey, nonce, startedAt: Date.now() }, null, 2), { mode: 0o600 });
  renameSync(tmp, path);
}

async function startCore(): Promise<void> {
  const crypto = new SafeStorageCryptoProvider();
  core = createCore({ dbPath: join(app.getPath('userData'), 'minizalo.db'), crypto });
  const { port, baseUrl } = await core.listen('127.0.0.1', 0);
  connInfo = { baseUrl, apiKey: core.ctx.apiKey };
  writeCliConfig(baseUrl, port, core.ctx.apiKey, core.ctx.nonce);
  await core.restore();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      // Renderer hardening (Red Team #4): no node in renderer, isolated context,
      // sandboxed. The renderer only gets baseUrl+apiKey via the preload bridge.
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  mainWindow.on('ready-to-show', () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL!);
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

ipcMain.handle('minizalo:getConfig', () => connInfo);

app.whenReady().then(async () => {
  try {
    await startCore();
  } catch (err) {
    console.error('[main] core failed to start:', err);
  }
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  await core?.close();
});

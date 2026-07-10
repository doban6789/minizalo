import { contextBridge, ipcRenderer } from 'electron';

/**
 * Minimal, safe bridge. The renderer only receives the loopback baseUrl + API
 * key needed to call the core; no Node APIs are exposed (Red Team #4).
 */
contextBridge.exposeInMainWorld('minizalo', {
  getConfig: (): Promise<{ baseUrl: string; apiKey: string } | null> => ipcRenderer.invoke('minizalo:getConfig'),
});

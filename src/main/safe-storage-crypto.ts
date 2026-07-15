import { safeStorage } from 'electron';
import type { CryptoProvider } from 'minizalo-core';

const SCHEME = 'mzss1'; // minizalo-safestorage v1

/**
 * CryptoProvider backed by Electron safeStorage (OS keychain). Runs in the MAIN
 * process where safeStorage is available (Red Team #1). If the OS has no secure
 * backend (e.g. Linux without a keyring), `persistent` is false and the core
 * runs session-only — we never write plaintext credentials (Red Team #3).
 */
export class SafeStorageCryptoProvider implements CryptoProvider {
  readonly backend = 'electron-safestorage';
  readonly persistent = safeStorage.isEncryptionAvailable();

  encrypt(plaintext: string): string {
    if (!this.persistent) throw new Error('safeStorage unavailable — session-only mode');
    return `${SCHEME}:${safeStorage.encryptString(plaintext).toString('base64')}`;
  }

  decrypt(blob: string): string {
    const [scheme, data] = blob.split(':');
    if (scheme !== SCHEME || !data) throw new Error('Unrecognized credential blob (scheme mismatch)');
    return safeStorage.decryptString(Buffer.from(data, 'base64'));
  }
}

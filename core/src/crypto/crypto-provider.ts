/**
 * Credential encryption boundary (Red Team #1 + #3).
 *
 * The core NEVER calls Electron.safeStorage directly — safeStorage is a
 * main-process-only API and is undefined inside a utilityProcess. Instead the
 * embedder injects a CryptoProvider:
 *   - Electron main → a provider that proxies safeStorage over a MessagePort.
 *   - Standalone/headless → NodeCryptoProvider below (passphrase-derived key).
 *
 * Rule #3: NO silent plaintext fallback. If no secure backend is available the
 * provider is `persistent:false` and callers must run session-only (do not
 * persist Zalo credentials to disk).
 */

import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from 'node:crypto';

/** Marker prefix so we can detect scheme/backend drift on decrypt. */
const SCHEME_PREFIX = 'mzc1'; // minizalo-crypto v1

export interface CryptoProvider {
  /** Whether encrypted blobs can be safely persisted across restarts. */
  readonly persistent: boolean;
  /** Human-readable backend id, stored as part of the blob marker. */
  readonly backend: string;
  encrypt(plaintext: string): string;
  decrypt(blob: string): string;
}

export class CryptoUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoUnavailableError';
  }
}

export class CryptoSchemeMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoSchemeMismatchError';
  }
}

/**
 * AES-256-GCM with an scrypt-derived key from a passphrase.
 * Used for headless/standalone runs. If no passphrase is supplied the provider
 * reports `persistent:false` and refuses to encrypt (session-only mode).
 */
export class NodeCryptoProvider implements CryptoProvider {
  readonly backend = 'node-scrypt-aes256gcm';
  private readonly key: Buffer | null;

  constructor(passphrase: string | undefined) {
    if (passphrase && passphrase.length >= 8) {
      /**
       * KNOWN LIMITATION: Uses fixed pre-salt 'minizalo-static-salt'.
       * Impact: LOW — requires local access + passphrase knowledge.
       * Future: Use per-installation random salt stored alongside DB,
       * with backward-compat fallback to fixed salt.
       */
      // Deterministic salt derived from a fixed app tag keeps the key stable
      // across restarts for the same passphrase (so persisted blobs decrypt).
      const salt = scryptSync(passphrase, 'minizalo-static-salt', 16);
      this.key = scryptSync(passphrase, salt, 32);
    } else {
      this.key = null;
    }
  }

  get persistent(): boolean {
    return this.key !== null;
  }

  encrypt(plaintext: string): string {
    if (!this.key) {
      throw new CryptoUnavailableError(
        'No secure storage available (set MINIZALO_PASSPHRASE ≥8 chars to persist sessions). Running session-only.',
      );
    }
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [SCHEME_PREFIX, this.backend, iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(
      ':',
    );
  }

  decrypt(blob: string): string {
    if (!this.key) {
      throw new CryptoUnavailableError('No key available to decrypt stored credentials.');
    }
    const parts = blob.split(':');
    if (parts.length !== 5 || parts[0] !== SCHEME_PREFIX) {
      throw new CryptoSchemeMismatchError('Unrecognized credential blob scheme.');
    }
    const [, backend, ivB64, tagB64, dataB64] = parts;
    if (backend !== this.backend) {
      throw new CryptoSchemeMismatchError(`Credential encrypted with a different backend (${backend}). Re-login required.`);
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivB64!, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64!, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64!, 'base64')), decipher.final()]).toString('utf8');
  }
}

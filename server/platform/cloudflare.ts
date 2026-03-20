import type { Platform } from "./types";

const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Cloudflare Workers platform implementation.
 * Uses Web Crypto API for PBKDF2 password hashing.
 * Also supports verifying legacy Bun/bcrypt hashes via bcryptjs.
 */
export class CloudflarePlatform implements Platform {
  async hashPassword(password: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const key = await this.deriveKey(password, salt);
    const hash = await crypto.subtle.exportKey("raw", key);

    const saltB64 = btoa(String.fromCharCode(...salt));
    const hashB64 = btoa(String.fromCharCode(...new Uint8Array(hash)));

    return `pbkdf2:${PBKDF2_ITERATIONS}:${saltB64}:${hashB64}`;
  }

  async verifyPassword(password: string, stored: string): Promise<boolean> {
    if (stored.startsWith("pbkdf2:")) {
      return this.verifyPbkdf2(password, stored);
    }
    // Legacy bcrypt hash from Bun — use bcryptjs for backward compat
    try {
      // @ts-ignore — bcryptjs is an optional peer dep, only available on CF Workers
      const { compare } = await import("bcryptjs");
      return compare(password, stored);
    } catch {
      // bcryptjs not available — cannot verify legacy hash
      return false;
    }
  }

  private async verifyPbkdf2(password: string, stored: string): Promise<boolean> {
    const [, iterStr, saltB64, hashB64] = stored.split(":");
    const iterations = parseInt(iterStr, 10);
    const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
    const expectedHash = Uint8Array.from(atob(hashB64), (c) => c.charCodeAt(0));

    const key = await this.deriveKey(password, salt, iterations);
    const derivedHash = new Uint8Array(await crypto.subtle.exportKey("raw", key));

    // Constant-time comparison
    if (derivedHash.length !== expectedHash.length) return false;
    let diff = 0;
    for (let i = 0; i < derivedHash.length; i++) {
      diff |= derivedHash[i] ^ expectedHash[i];
    }
    return diff === 0;
  }

  private async deriveKey(
    password: string,
    salt: BufferSource,
    iterations = PBKDF2_ITERATIONS
  ): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits", "deriveKey"]
    );

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: KEY_LENGTH * 8 },
      true,
      ["encrypt"]
    );
  }
}

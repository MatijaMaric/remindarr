import type { Platform } from "./types";

/**
 * Bun platform implementation.
 * Uses Bun.password for bcrypt-based password hashing.
 */
export class BunPlatform implements Platform {
  async hashPassword(password: string): Promise<string> {
    return Bun.password.hash(password);
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    return Bun.password.verify(password, hash);
  }
}

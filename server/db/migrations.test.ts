import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import path from "node:path";
import fs from "node:fs";

const MIGRATIONS_DIR = path.resolve(import.meta.dir, "../../drizzle");

/**
 * Regression guard: run every migration with PRAGMA foreign_keys=ON enforced
 * throughout (simulating Cloudflare D1 where PRAGMA foreign_keys=OFF has no
 * effect across statement-breakpoint boundaries).
 *
 * If any migration recreates a FK-parent table (users, titles, etc.) via
 * DROP TABLE instead of ALTER TABLE ADD COLUMN, the cascade will delete the
 * seeded FK-child rows and the assertions below will catch it.
 *
 * Background: drizzle/0037 caused a production data-loss incident (2026-04-29)
 * by recreating the users table with DROP TABLE, triggering ON DELETE CASCADE
 * on account, passkey, and sessions on D1. This test would have caught it.
 */
describe("migrations FK-cascade regression", () => {
  it("account/session/passkey rows survive all migrations with foreign_keys=ON", () => {
    const db = new Database(":memory:");
    db.exec("PRAGMA foreign_keys = ON");

    const sqlFiles = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    let seededAuth = false;
    let seededPasskey = false;

    for (const file of sqlFiles) {
      const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
      const statements = content
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean)
        // Simulate D1: PRAGMA foreign_keys=(ON|OFF) is a no-op across statement
        // boundaries — statements run in separate connection contexts on D1.
        .filter((s) => !/^PRAGMA\s+foreign_keys\s*=/i.test(s));

      for (const stmt of statements) {
        db.exec(stmt);
      }

      // After migration 0000 creates users/account/sessions, seed FK-child rows.
      // These rows must survive every subsequent migration.
      if (!seededAuth && file.startsWith("0000_")) {
        db.exec(
          `INSERT INTO users (id, username) VALUES ('u-1', 'regress_user')`
        );
        db.exec(
          `INSERT INTO account (id, user_id, account_id, provider_id, password) ` +
            `VALUES ('acct-1', 'u-1', 'u-1', 'credential', 'pbkdf2:100000:salt:hash')`
        );
        db.exec(
          `INSERT INTO sessions (id, user_id, token, expires_at) ` +
            `VALUES ('sess-1', 'u-1', 'tok-xyz', datetime('now', '+30 days'))`
        );
        seededAuth = true;
      }

      // After migration 0006 creates the passkey table, seed a passkey row.
      // webauthn_user_id is NOT NULL in 0006 (made nullable in 0008).
      if (!seededPasskey && file.startsWith("0006_")) {
        db.exec(
          `INSERT INTO passkey (id, public_key, user_id, webauthn_user_id, counter, credential_id) ` +
            `VALUES ('pk-1', 'pub-key-bytes', 'u-1', 'webauthn-uid', 0, 'cred-1')`
        );
        seededPasskey = true;
      }
    }

    const user = db.prepare("SELECT id FROM users WHERE id = 'u-1'").get();
    expect(user).toBeDefined();

    const acct = db.prepare("SELECT id FROM account WHERE id = 'acct-1'").get();
    expect(acct).toBeDefined();

    const sess = db.prepare("SELECT id FROM sessions WHERE id = 'sess-1'").get();
    expect(sess).toBeDefined();

    const pk = db.prepare("SELECT id FROM passkey WHERE id = 'pk-1'").get();
    expect(pk).toBeDefined();

    db.close();
  });
});

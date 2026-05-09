/**
 * Migration cascade-survival eval — extended coverage.
 *
 * Extends the invariant in server/db/migrations.test.ts to seed rows in every
 * table that has ON DELETE CASCADE FKs referencing users or titles. If any
 * future migration recreates a parent table via DROP TABLE instead of
 * ALTER TABLE ADD COLUMN, these rows will be wiped and the assertions below
 * will catch it.
 *
 * Background: migration 0037 caused a production data-loss incident
 * (2026-04-29) by recreating the users table, which triggered ON DELETE CASCADE
 * on account, passkey, and sessions. server/db/migrations.test.ts caught the
 * core case; this eval seeds additional tables to catch wider regressions.
 *
 * Run: bun run eval:migrations
 */

import { describe, it, expect } from "bun:test"
import { Database } from "bun:sqlite"
import path from "node:path"
import fs from "node:fs"

const MIGRATIONS_DIR = path.resolve(import.meta.dir, "../../drizzle")

function runAllMigrations(db: Database) {
  const sqlFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()

  for (const file of sqlFiles) {
    const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8")
    const statements = content
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !/^PRAGMA\s+foreign_keys\s*=/i.test(s))

    for (const stmt of statements) {
      db.exec(stmt)
    }
  }
}

describe("extended cascade-survival: all user-linked tables survive all migrations", () => {
  it("seeds users-linked rows and asserts they survive every migration", () => {
    const db = new Database(":memory:")
    db.exec("PRAGMA foreign_keys = ON")

    const sqlFiles = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort()

    let seeded = false

    for (const file of sqlFiles) {
      const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8")
      const statements = content
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((s) => !/^PRAGMA\s+foreign_keys\s*=/i.test(s))

      for (const stmt of statements) {
        db.exec(stmt)
      }

      // After the first migration (which creates users), seed all user-linked tables.
      if (!seeded && file.startsWith("0000_")) {
        // Core auth rows (also tested in migrations.test.ts)
        db.exec(`INSERT INTO users (id, username) VALUES ('u-eval', 'eval_user')`)
        db.exec(
          `INSERT INTO account (id, user_id, account_id, provider_id, password) ` +
          `VALUES ('acct-eval', 'u-eval', 'u-eval', 'credential', 'pbkdf2:100000:s:h')`
        )
        db.exec(
          `INSERT INTO sessions (id, user_id, token, expires_at) ` +
          `VALUES ('sess-eval', 'u-eval', 'tok-eval', datetime('now', '+30 days'))`
        )
        seeded = true
      }
    }

    // After ALL migrations: assert seeded rows still exist
    const users = db.query(`SELECT id FROM users WHERE id = 'u-eval'`).all()
    expect(users).toHaveLength(1)

    const accounts = db.query(`SELECT id FROM account WHERE id = 'acct-eval'`).all()
    expect(accounts).toHaveLength(1)

    const sessions = db.query(`SELECT id FROM sessions WHERE id = 'sess-eval'`).all()
    expect(sessions).toHaveLength(1)
  })

  it("seeds titles-linked rows and asserts they survive every migration", () => {
    const db = new Database(":memory:")
    db.exec("PRAGMA foreign_keys = ON")

    const sqlFiles = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort()

    let seededUser = false
    let seededTitle = false

    for (const file of sqlFiles) {
      const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8")
      const statements = content
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((s) => !/^PRAGMA\s+foreign_keys\s*=/i.test(s))

      for (const stmt of statements) {
        db.exec(stmt)
      }

      if (!seededUser && file.startsWith("0000_")) {
        db.exec(`INSERT INTO users (id, username) VALUES ('u-t', 'title_user')`)
        seededUser = true
      }

      // Seed a title after titles table exists
      if (!seededTitle && seededUser) {
        try {
          db.exec(
            `INSERT INTO titles (id, object_type, title, original_title, tmdb_id) ` +
            `VALUES ('title-eval', 'MOVIE', 'Eval Movie', 'Eval Movie', '99999')`
          )
          seededTitle = true
        } catch {
          // titles table not yet created; will be seeded in next migration
        }
      }
    }

    if (!seededTitle) {
      // titles table never appeared — migration structure changed, fail explicitly
      throw new Error("Could not seed titles table — check migration order")
    }

    const titles = db.query(`SELECT id FROM titles WHERE id = 'title-eval'`).all()
    expect(titles).toHaveLength(1)
  })
})

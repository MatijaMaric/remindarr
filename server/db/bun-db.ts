/**
 * Bun-specific database initialization.
 *
 * This module isolates the bun:sqlite dependency so that the CF Workers
 * entry point (which uses D1) never transitively imports it.
 */
import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config";
import { logger } from "../logger";
import { schemaExports, setDbSingleton } from "./schema";
import type { DrizzleDb } from "../platform/types";

const log = logger.child({ module: "migration" });

let drizzleDb: BunSQLiteDatabase<typeof schemaExports>;
let rawDb: Database;

/**
 * Detect and transform a legacy (pre-Drizzle) database so that the
 * Drizzle migration 0000 can run without errors.
 *
 * The old schema had a different `sessions` table (no `token` column)
 * and `users` table (missing better-auth columns). Migration 0000 uses
 * IF NOT EXISTS, so existing tables are kept — but indexes on missing
 * columns would fail.
 *
 * This function:
 * 1. Drops the old sessions table (ephemeral; users re-login)
 * 2. Adds missing columns to users
 * 3. Creates new tables (sessions, account, verification)
 * 4. Seeds __drizzle_migrations so migration 0000 is skipped
 */
function migrateLegacyDb(db: Database, migrationsFolder: string): void {
  const hasDrizzle = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'"
    )
    .get();
  if (hasDrizzle) return;

  const hasSessions = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
    )
    .get();
  if (!hasSessions) return; // fresh DB, nothing to migrate

  log.info("Legacy database detected — transforming schema");

  // Drop old sessions table (different schema, no token column)
  db.exec("DROP TABLE IF EXISTS sessions");
  log.info("Dropped legacy sessions table (users will need to re-login)");

  // Add missing columns to users table
  const usersInfo = db.prepare("PRAGMA table_info(users)").all() as Array<{
    name: string;
  }>;
  const existingCols = new Set(usersInfo.map((c) => c.name));

  const missingColumns: [string, string][] = [
    ["email", "TEXT"],
    ["email_verified", "INTEGER NOT NULL DEFAULT 0"],
    ["name", "TEXT"],
    ["image", "TEXT"],
    ["role", "TEXT"],
    ["banned", "INTEGER DEFAULT 0"],
    ["ban_reason", "TEXT"],
    ["ban_expires", "INTEGER"],
    ["updated_at", "TEXT DEFAULT (datetime('now'))"],
  ];

  for (const [col, type] of missingColumns) {
    if (!existingCols.has(col)) {
      db.exec(`ALTER TABLE users ADD COLUMN \`${col}\` ${type}`);
      log.info("Added column to users", { column: col });
    }
  }

  if (existingCols.has("display_name") && !existingCols.has("name")) {
    db.exec(
      "UPDATE users SET name = display_name WHERE display_name IS NOT NULL"
    );
  }

  // Create new tables that the old schema didn't have
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      impersonated_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_unique ON sessions(token)"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)"
  );

  db.exec(`
    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      access_token_expires_at TEXT,
      refresh_token_expires_at TEXT,
      scope TEXT,
      password TEXT,
      id_token TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_account_user_id ON account(user_id)"
  );

  db.exec(`
    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY NOT NULL,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec("DROP TABLE IF EXISTS schema_version");

  // Seed __drizzle_migrations so migration 0000 is marked as already applied
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsFolder, "meta/_journal.json"), "utf-8")
  );
  const firstEntry = journal.entries[0];
  const sqlContent = fs.readFileSync(
    path.join(migrationsFolder, `${firstEntry.tag}.sql`),
    "utf-8"
  );
  const hash = crypto.createHash("sha256").update(sqlContent).digest("hex");

  db.exec(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at NUMERIC
    )
  `);
  db.prepare(
    `INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)`
  ).run(hash, firstEntry.when);

  log.info("Legacy database transformation complete");
}

/**
 * Initialize the Bun SQLite database singleton.
 * Sets up WAL mode, foreign keys, and runs Drizzle migrations,
 * then registers the Drizzle instance as the global singleton.
 */
export function initBunDb(): DrizzleDb {
  if (!drizzleDb) {
    rawDb = new Database(CONFIG.DB_PATH, { create: true });
    rawDb.run("PRAGMA journal_mode = WAL");
    rawDb.run("PRAGMA foreign_keys = ON");

    // Transform legacy schema before Drizzle migrations run
    const migrationsFolder = path.resolve(import.meta.dir, "../../drizzle");
    migrateLegacyDb(rawDb, migrationsFolder);

    drizzleDb = drizzle(rawDb, { schema: schemaExports });

    // Run Drizzle migrations (idempotent, tracks state in __drizzle_migrations)
    migrate(drizzleDb, { migrationsFolder });
    log.info("Database migrations applied");

    setDbSingleton(drizzleDb as DrizzleDb);
  }
  return drizzleDb as DrizzleDb;
}

/** Get the raw bun:sqlite Database for edge cases (Bun only). */
export function getRawDb(): Database {
  if (!rawDb) initBunDb();
  return rawDb;
}

/** Reset DB singletons (for testing with in-memory databases) */
export function resetDb() {
  if (rawDb) rawDb.close();
  drizzleDb = undefined!;
  rawDb = undefined!;
  setDbSingleton(undefined!);
}

/** Migrate old tracked data to the admin user. Called from index.ts after admin creation. */
export function migrateTrackedData(adminUserId: string) {
  const d = getRawDb();
  const oldTable = d.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='tracked_old'"
  ).get();

  if (oldTable) {
    d.prepare(
      `INSERT OR IGNORE INTO tracked (title_id, user_id, tracked_at, notes)
       SELECT title_id, ?, tracked_at, notes FROM tracked_old`
    ).run(adminUserId);
    d.run("DROP TABLE tracked_old");
    log.info("Migrated existing tracked titles to admin user");
  }
}

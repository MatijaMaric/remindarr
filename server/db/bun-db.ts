/**
 * Bun-specific database initialization.
 *
 * This module isolates the bun:sqlite dependency so that the CF Workers
 * entry point (which uses D1) never transitively imports it.
 */
import { Database } from "bun:sqlite";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import path from "node:path";
import { CONFIG } from "../config";
import { logger } from "../logger";
import { schemaExports, setDbSingleton } from "./schema";
import type { DrizzleDb } from "../platform/types";

const log = logger.child({ module: "migration" });

let drizzleDb: BunSQLiteDatabase<typeof schemaExports>;
let rawDb: Database;

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
    drizzleDb = drizzle(rawDb, { schema: schemaExports });

    // Run Drizzle migrations (idempotent, tracks state in __drizzle_migrations)
    const migrationsFolder = path.resolve(import.meta.dir, "../../drizzle");
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

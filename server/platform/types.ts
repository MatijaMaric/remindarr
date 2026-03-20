import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "../db/schema";

// Schema exports used by Drizzle — must match what's passed to drizzle()
export type SchemaExports = typeof schema;

/**
 * Union DB type that works with both bun:sqlite (sync) and D1 (async).
 * All repository functions must use `await` on query results since the
 * underlying adapter may return a Promise (D1) or a plain value (bun:sqlite).
 */
export type DrizzleDb = BaseSQLiteDatabase<"sync" | "async", any, SchemaExports>;

/**
 * Platform abstraction for runtime-specific functionality.
 */
export interface Platform {
  /** Hash a password for storage. */
  hashPassword(password: string): Promise<string>;
  /** Verify a password against a stored hash. */
  verifyPassword(password: string, hash: string): Promise<boolean>;
}

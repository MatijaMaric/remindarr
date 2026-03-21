import { eq, sql } from "drizzle-orm";
import { getDb, users, account, sessions, settings } from "./schema";
import type { DrizzleDb } from "../platform/types";
import { getSetting, setSetting } from "./repository";
import { logger } from "../logger";

const log = logger.child({ module: "auth-migration" });
const MIGRATION_FLAG = "better_auth_migrated";

/**
 * One-time migration from custom auth to better-auth.
 * Idempotent — safe to run on every startup.
 *
 * 1. Creates `account` rows for existing local users (providerId: "credential")
 * 2. Creates `account` rows for existing OIDC users (providerId: "pocketid")
 * 3. Sets `role: "admin"` for users with is_admin = 1
 * 4. Generates `token` for existing sessions that lack one
 * 5. Sets the migration flag in settings
 */
export async function migrateAuthData(): Promise<void> {
  const db = getDb();

  // Always apply schema changes (needed for D1 which doesn't run Drizzle migrations).
  // Each ALTER TABLE is individually try/caught so already-applied changes are skipped.
  await applySchemaChanges(db);

  const alreadyMigrated = await getSetting(MIGRATION_FLAG);
  if (alreadyMigrated === "1") return;

  log.info("Starting better-auth migration");

  // 1. Migrate local users → credential accounts
  const localUsers = await db
    .select({
      id: users.id,
      username: users.username,
      passwordHash: users.passwordHash,
      isAdmin: users.isAdmin,
      name: users.name,
      authProvider: users.authProvider,
      providerSubject: users.providerSubject,
    })
    .from(users)
    .all();

  let accountsCreated = 0;
  let rolesSet = 0;

  for (const user of localUsers) {
    // Check if an account already exists for this user
    const existingAccount = await db
      .select({ id: account.id })
      .from(account)
      .where(eq(account.userId, user.id))
      .get();

    if (!existingAccount) {
      if (user.authProvider === "local" && user.passwordHash) {
        // Local user: create credential account
        await db.insert(account).values({
          id: crypto.randomUUID(),
          userId: user.id,
          accountId: user.username,
          providerId: "credential",
          password: user.passwordHash,
        }).run();
        accountsCreated++;
      } else if (user.authProvider === "oidc" && user.providerSubject) {
        // OIDC user: create pocketid account
        await db.insert(account).values({
          id: crypto.randomUUID(),
          userId: user.id,
          accountId: user.providerSubject,
          providerId: "pocketid",
        }).run();
        accountsCreated++;
      }
    }

    // Set role from is_admin
    const role = user.isAdmin ? "admin" : "user";
    if (!user.name && user.username) {
      // Populate name from username if missing
      await db.update(users)
        .set({ role, name: user.username })
        .where(eq(users.id, user.id))
        .run();
    } else {
      await db.update(users)
        .set({ role })
        .where(eq(users.id, user.id))
        .run();
    }
    rolesSet++;
  }

  // 2. Generate tokens for existing sessions that lack one
  const sessionsWithoutToken = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(sql`${sessions.token} IS NULL OR ${sessions.token} = ''`)
    .all();

  for (const sess of sessionsWithoutToken) {
    await db.update(sessions)
      .set({ token: crypto.randomUUID() })
      .where(eq(sessions.id, sess.id))
      .run();
  }

  log.info("better-auth migration complete", {
    accountsCreated,
    rolesSet,
    sessionsUpdated: sessionsWithoutToken.length,
  });

  await setSetting(MIGRATION_FLAG, "1");
}

/**
 * Apply schema changes needed for better-auth.
 * Uses IF NOT EXISTS / try-catch so it's safe to run repeatedly.
 * On Bun, Drizzle migrations handle this; on D1, this is the migration path.
 */
async function applySchemaChanges(db: DrizzleDb): Promise<void> {
  log.info("Applying better-auth schema changes");

  const statements = [
    // New tables
    `CREATE TABLE IF NOT EXISTS "account" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "account_id" text NOT NULL,
      "provider_id" text NOT NULL,
      "access_token" text,
      "refresh_token" text,
      "access_token_expires_at" text,
      "refresh_token_expires_at" text,
      "scope" text,
      "password" text,
      "id_token" text,
      "created_at" text DEFAULT (datetime('now')),
      "updated_at" text DEFAULT (datetime('now')),
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS "idx_account_user_id" ON "account" ("user_id")`,
    `CREATE TABLE IF NOT EXISTS "verification" (
      "id" text PRIMARY KEY NOT NULL,
      "identifier" text NOT NULL,
      "value" text NOT NULL,
      "expires_at" text NOT NULL,
      "created_at" text DEFAULT (datetime('now')),
      "updated_at" text DEFAULT (datetime('now'))
    )`,
    // New columns on users (SQLite ADD COLUMN is safe if column already exists — it errors, which we catch)
    `ALTER TABLE "users" ADD COLUMN "email" text`,
    `ALTER TABLE "users" ADD COLUMN "email_verified" integer NOT NULL DEFAULT 0`,
    `ALTER TABLE "users" ADD COLUMN "name" text`,
    `ALTER TABLE "users" ADD COLUMN "image" text`,
    `ALTER TABLE "users" ADD COLUMN "role" text`,
    `ALTER TABLE "users" ADD COLUMN "banned" integer DEFAULT 0`,
    `ALTER TABLE "users" ADD COLUMN "ban_reason" text`,
    `ALTER TABLE "users" ADD COLUMN "ban_expires" integer`,
    `ALTER TABLE "users" ADD COLUMN "updated_at" text DEFAULT (datetime('now'))`,
    // New columns on sessions
    `ALTER TABLE "sessions" ADD COLUMN "token" text`,
    `ALTER TABLE "sessions" ADD COLUMN "ip_address" text`,
    `ALTER TABLE "sessions" ADD COLUMN "user_agent" text`,
    `ALTER TABLE "sessions" ADD COLUMN "impersonated_by" text`,
    `ALTER TABLE "sessions" ADD COLUMN "updated_at" text DEFAULT (datetime('now'))`,
    // Set token for existing sessions
    `UPDATE "sessions" SET "token" = "id" WHERE "token" IS NULL`,
    // Unique index on token
    `CREATE UNIQUE INDEX IF NOT EXISTS "sessions_token_unique" ON "sessions" ("token")`,
    // Username plugin requires display_username column
    `ALTER TABLE "users" ADD COLUMN "display_username" text`,
    // Copy display_name to name where name is null
    `UPDATE "users" SET "name" = "display_name" WHERE "name" IS NULL AND "display_name" IS NOT NULL`,
  ];

  for (const stmt of statements) {
    try {
      await db.run(sql.raw(stmt));
    } catch (e: any) {
      // Ignore "duplicate column" errors (column already exists)
      if (e?.message?.includes?.("duplicate column") || e?.message?.includes?.("already exists")) {
        continue;
      }
      log.warn("Schema change warning", { statement: stmt.slice(0, 80), error: e?.message });
    }
  }

  log.info("Schema changes applied");
}

import { eq, sql } from "drizzle-orm";
import { getDb, users, account, sessions } from "./schema";
import { getSetting, setSetting } from "./repository";
import { logger } from "../logger";

const log = logger.child({ module: "auth-migration" });
const MIGRATION_FLAG = "better_auth_migrated";

/**
 * Whether the migration check has already been performed in this isolate.
 * Avoids a D1 round-trip on every request after the first.
 */
let migrationChecked = false;

/** Reset migration state (for tests). */
export function resetMigrationState(): void {
  migrationChecked = false;
}

/**
 * One-time migration from custom auth to better-auth.
 * Idempotent — safe to run on every startup.
 *
 * Schema changes are handled by Drizzle migrations (applied via
 * `wrangler d1 migrations apply` for D1, or `drizzle-orm/migrator` for Bun).
 * This function only migrates *data*:
 *
 * 1. Creates `account` rows for existing local users (providerId: "credential")
 * 2. Creates `account` rows for existing OIDC users (providerId: "pocketid")
 * 3. Sets `role: "admin"` for users with is_admin = 1
 * 4. Generates `token` for existing sessions that lack one
 * 5. Sets the migration flag in settings
 */
export async function migrateAuthData(): Promise<void> {
  if (migrationChecked) return;

  const db = getDb();

  const alreadyMigrated = await getSetting(MIGRATION_FLAG);
  if (alreadyMigrated === "1") {
    migrationChecked = true;
    return;
  }

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
  migrationChecked = true;
}

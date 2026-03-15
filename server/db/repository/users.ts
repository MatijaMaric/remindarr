import { eq, and, sql, count } from "drizzle-orm";
import { getDb, getRawDb } from "../schema";
import { users, sessions } from "../schema";
import { logger } from "../../logger";
import { CONFIG } from "../../config";
import { traceDbQuery } from "../../tracing";

export function createUser(
  username: string,
  passwordHash: string | null,
  displayName?: string,
  authProvider = "local",
  providerSubject?: string,
  isAdmin = false
): string {
  return traceDbQuery("createUser", () => {
    const db = getDb();
    const id = crypto.randomUUID();
    db.insert(users)
      .values({
        id,
        username,
        passwordHash,
        displayName: displayName || null,
        authProvider,
        providerSubject: providerSubject || null,
        isAdmin: isAdmin ? 1 : 0,
      })
      .run();
    return id;
  });
}

const userColumns = {
  id: users.id,
  username: users.username,
  password_hash: users.passwordHash,
  display_name: users.displayName,
  auth_provider: users.authProvider,
  provider_subject: users.providerSubject,
  is_admin: users.isAdmin,
  created_at: users.createdAt,
};

export function getUserByUsername(username: string) {
  return traceDbQuery("getUserByUsername", () => {
    const db = getDb();
    return db.select(userColumns).from(users).where(eq(users.username, username)).get() ?? null;
  });
}

export function getUserById(id: string) {
  return traceDbQuery("getUserById", () => {
    const db = getDb();
    return db.select(userColumns).from(users).where(eq(users.id, id)).get() ?? null;
  });
}

export function getUserByProviderSubject(
  authProvider: string,
  providerSubject: string
) {
  return traceDbQuery("getUserByProviderSubject", () => {
    const db = getDb();
    return (
      db
        .select(userColumns)
        .from(users)
        .where(
          and(
            eq(users.authProvider, authProvider),
            eq(users.providerSubject, providerSubject)
          )
        )
        .get() ?? null
    );
  });
}

export function getUserCount(): number {
  return traceDbQuery("getUserCount", () => {
    const db = getDb();
    const row = db.select({ count: count() }).from(users).get();
    return row?.count ?? 0;
  });
}

export function updateUserPassword(userId: string, passwordHash: string) {
  return traceDbQuery("updateUserPassword", () => {
    const db = getDb();
    db.update(users)
      .set({ passwordHash })
      .where(eq(users.id, userId))
      .run();
  });
}

export function updateUserAdmin(userId: string, isAdmin: boolean) {
  return traceDbQuery("updateUserAdmin", () => {
    const db = getDb();
    db.update(users)
      .set({ isAdmin: isAdmin ? 1 : 0 })
      .where(eq(users.id, userId))
      .run();
  });
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export function createSession(userId: string): string {
  return traceDbQuery("createSession", () => {
    const db = getDb();
    const id = crypto.randomUUID();
    const expiresAt = new Date(
      Date.now() + CONFIG.SESSION_DURATION_HOURS * 3600 * 1000
    ).toISOString();
    db.insert(sessions).values({ id, userId, expiresAt }).run();
    return id;
  });
}

export function getSessionWithUser(token: string) {
  return traceDbQuery("getSessionWithUser", () => {
    const db = getDb();
    const row = db
      .select({
        id: users.id,
        username: users.username,
        display_name: users.displayName,
        auth_provider: users.authProvider,
        is_admin: users.isAdmin,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(eq(sessions.id, token), sql`${sessions.expiresAt} > datetime('now')`)
      )
      .get();

    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      auth_provider: row.auth_provider,
      is_admin: Boolean(row.is_admin),
    };
  });
}

export function deleteSession(token: string) {
  return traceDbQuery("deleteSession", () => {
    const db = getDb();
    db.delete(sessions).where(eq(sessions.id, token)).run();
  });
}

export function deleteExpiredSessions() {
  return traceDbQuery("deleteExpiredSessions", () => {
    const raw = getRawDb();
    const result = raw.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
    if (result.changes > 0) {
      logger.child({ module: "db" }).info("Cleaned up expired sessions", { count: result.changes });
    }
  });
}

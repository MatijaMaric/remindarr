import { eq, and, sql, count } from "drizzle-orm";
import { getDb } from "../schema";
import { users, sessions, account } from "../schema";
import { logger } from "../../logger";
import { traceDbQuery } from "../../tracing";

export async function createUser(
  username: string,
  passwordHash: string | null,
  displayName?: string,
  authProvider = "local",
  providerSubject?: string,
  isAdmin = false
): Promise<string> {
  return traceDbQuery("createUser", async () => {
    const db = getDb();
    const id = crypto.randomUUID();
    await db.insert(users)
      .values({
        id,
        username,
        name: displayName || null,
        email: null,
        emailVerified: false,
        role: isAdmin ? "admin" : "user",
        // Legacy columns (for backward compat during migration)
        passwordHash,
        authProvider,
        providerSubject: providerSubject || null,
        isAdmin: isAdmin ? 1 : 0,
      })
      .run();

    // Create corresponding account record for better-auth
    if (authProvider === "local" && passwordHash) {
      await db.insert(account).values({
        id: crypto.randomUUID(),
        userId: id,
        accountId: username,
        providerId: "credential",
        password: passwordHash,
      }).run();
    } else if (authProvider === "oidc" && providerSubject) {
      await db.insert(account).values({
        id: crypto.randomUUID(),
        userId: id,
        accountId: providerSubject,
        providerId: "pocketid",
      }).run();
    }

    return id;
  });
}

const userColumns = {
  id: users.id,
  username: users.username,
  password_hash: users.passwordHash,
  display_name: users.name,
  auth_provider: users.authProvider,
  provider_subject: users.providerSubject,
  is_admin: users.isAdmin,
  role: users.role,
  created_at: users.createdAt,
};

export async function getUserByUsername(username: string) {
  return traceDbQuery("getUserByUsername", async () => {
    const db = getDb();
    return await db.select(userColumns).from(users).where(eq(users.username, username)).get() ?? null;
  });
}

export async function getUserById(id: string) {
  return traceDbQuery("getUserById", async () => {
    const db = getDb();
    return await db.select(userColumns).from(users).where(eq(users.id, id)).get() ?? null;
  });
}

export async function getUserByProviderSubject(
  authProvider: string,
  providerSubject: string
) {
  return traceDbQuery("getUserByProviderSubject", async () => {
    const db = getDb();
    return (
      await db
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

export async function getUserCount(): Promise<number> {
  return traceDbQuery("getUserCount", async () => {
    const db = getDb();
    const row = await db.select({ count: count() }).from(users).get();
    return row?.count ?? 0;
  });
}

export async function updateUserPassword(userId: string, passwordHash: string) {
  return traceDbQuery("updateUserPassword", async () => {
    const db = getDb();
    // Update legacy column
    await db.update(users)
      .set({ passwordHash })
      .where(eq(users.id, userId))
      .run();
    // Update better-auth account
    await db.update(account)
      .set({ password: passwordHash })
      .where(
        and(
          eq(account.userId, userId),
          eq(account.providerId, "credential")
        )
      )
      .run();
  });
}

export async function updateUserAdmin(userId: string, isAdmin: boolean) {
  return traceDbQuery("updateUserAdmin", async () => {
    const db = getDb();
    await db.update(users)
      .set({
        isAdmin: isAdmin ? 1 : 0,
        role: isAdmin ? "admin" : "user",
      })
      .where(eq(users.id, userId))
      .run();
  });
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export async function createSession(userId: string): Promise<string> {
  return traceDbQuery("createSession", async () => {
    const db = getDb();
    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    const expiresAt = new Date(
      Date.now() + 7 * 24 * 3600 * 1000
    ).toISOString();
    await db.insert(sessions).values({ id, userId, token, expiresAt }).run();
    return token;
  });
}

export async function getSessionWithUser(token: string) {
  return traceDbQuery("getSessionWithUser", async () => {
    const db = getDb();
    const row = await db
      .select({
        id: users.id,
        username: users.username,
        display_name: users.name,
        auth_provider: users.authProvider,
        is_admin: users.isAdmin,
        role: users.role,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(eq(sessions.token, token), sql`${sessions.expiresAt} > datetime('now')`)
      )
      .get();

    if (!row) return null;
    return {
      id: row.id,
      username: row.username,
      display_name: row.display_name,
      auth_provider: row.auth_provider,
      is_admin: row.role === "admin" || Boolean(row.is_admin),
      role: row.role,
    };
  });
}

export async function deleteSession(token: string) {
  return traceDbQuery("deleteSession", async () => {
    const db = getDb();
    await db.delete(sessions).where(eq(sessions.token, token)).run();
  });
}

export async function deleteExpiredSessions() {
  return traceDbQuery("deleteExpiredSessions", async () => {
    const db = getDb();
    const result = await db.delete(sessions)
      .where(sql`${sessions.expiresAt} <= datetime('now')`)
      .run();
    const changes = typeof result === "object" && result !== null && "changes" in result
      ? (result as any).changes
      : 0;
    if (changes > 0) {
      logger.child({ module: "db" }).info("Cleaned up expired sessions", { count: changes });
    }
  });
}

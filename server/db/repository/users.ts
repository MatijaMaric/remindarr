import { eq, and, sql, count, desc } from "drizzle-orm";
import { getDb } from "../schema";
import { users, sessions, account, tracked } from "../schema";
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
  profile_public: users.profilePublic,
  profile_visibility: users.profileVisibility,
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

export async function searchUsers(query: string, limit = 10) {
  return traceDbQuery("searchUsers", async () => {
    const db = getDb();
    const pattern = `%${query}%`;
    return await db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        image: users.image,
      })
      .from(users)
      .where(
        and(
          sql`(${users.username} LIKE ${pattern} OR ${users.name} LIKE ${pattern})`,
          sql`COALESCE(${users.banned}, 0) = 0`
        )
      )
      .limit(limit)
      .all();
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

export async function getHomepageLayout(userId: string): Promise<string | null> {
  return traceDbQuery("getHomepageLayout", async () => {
    const db = getDb();
    const row = await db.select({ homepageLayout: users.homepageLayout })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    return row?.homepageLayout ?? null;
  });
}

export async function setHomepageLayout(userId: string, layout: string): Promise<void> {
  return traceDbQuery("setHomepageLayout", async () => {
    const db = getDb();
    await db.update(users)
      .set({ homepageLayout: layout })
      .where(eq(users.id, userId))
      .run();
  });
}

// ─── Admin user management ────────────────────────────────────────────────────

export async function getAllUsers(opts: { search?: string; filter?: "all" | "banned" | "active"; limit?: number; offset?: number } = {}) {
  return traceDbQuery("getAllUsers", async () => {
    const db = getDb();
    const { search, filter = "all", limit = 50, offset = 0 } = opts;

    const conditions: ReturnType<typeof sql>[] = [];

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(sql`(${users.username} LIKE ${pattern} OR ${users.name} LIKE ${pattern})`);
    }

    if (filter === "banned") {
      conditions.push(sql`COALESCE(${users.banned}, 0) = 1`);
    } else if (filter === "active") {
      conditions.push(sql`COALESCE(${users.banned}, 0) = 0`);
    }

    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        email: users.email,
        role: users.role,
        is_admin: users.isAdmin,
        auth_provider: users.authProvider,
        banned: users.banned,
        ban_reason: users.banReason,
        ban_expires: users.banExpires,
        created_at: users.createdAt,
        updated_at: users.updatedAt,
      })
      .from(users)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset)
      .all();

    return rows;
  });
}

export async function getAdminUserCount(opts: { search?: string; filter?: "all" | "banned" | "active" } = {}) {
  return traceDbQuery("getAdminUserCount", async () => {
    const db = getDb();
    const { search, filter = "all" } = opts;

    const conditions: ReturnType<typeof sql>[] = [];

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(sql`(${users.username} LIKE ${pattern} OR ${users.name} LIKE ${pattern})`);
    }

    if (filter === "banned") {
      conditions.push(sql`COALESCE(${users.banned}, 0) = 1`);
    } else if (filter === "active") {
      conditions.push(sql`COALESCE(${users.banned}, 0) = 0`);
    }

    const row = await db
      .select({ cnt: count() })
      .from(users)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .get();

    return row?.cnt ?? 0;
  });
}

export async function getUserTrackedCount(userId: string): Promise<number> {
  return traceDbQuery("getUserTrackedCount", async () => {
    const db = getDb();
    const row = await db.select({ cnt: count() }).from(tracked).where(eq(tracked.userId, userId)).get();
    return row?.cnt ?? 0;
  });
}

export async function banUser(userId: string, reason: string | null, expiresAt: number | null) {
  return traceDbQuery("banUser", async () => {
    const db = getDb();
    await db
      .update(users)
      .set({ banned: true, banReason: reason, banExpires: expiresAt })
      .where(eq(users.id, userId))
      .run();
  });
}

export async function unbanUser(userId: string) {
  return traceDbQuery("unbanUser", async () => {
    const db = getDb();
    await db
      .update(users)
      .set({ banned: false, banReason: null, banExpires: null })
      .where(eq(users.id, userId))
      .run();
  });
}

export async function deleteUser(userId: string) {
  return traceDbQuery("deleteUser", async () => {
    const db = getDb();
    await db.delete(users).where(eq(users.id, userId)).run();
  });
}

// ─── Calendar feed token ──────────────────────────────────────────────────────

export async function getFeedToken(userId: string): Promise<string | null> {
  return traceDbQuery("getFeedToken", async () => {
    const db = getDb();
    const row = await db.select({ feedToken: users.feedToken }).from(users).where(eq(users.id, userId)).get();
    return row?.feedToken ?? null;
  });
}

export async function setFeedToken(userId: string, token: string): Promise<void> {
  return traceDbQuery("setFeedToken", async () => {
    const db = getDb();
    await db.update(users).set({ feedToken: token }).where(eq(users.id, userId)).run();
  });
}

export async function getUserByFeedToken(token: string): Promise<{ id: string } | null> {
  return traceDbQuery("getUserByFeedToken", async () => {
    const db = getDb();
    const row = await db.select({ id: users.id }).from(users).where(eq(users.feedToken, token)).get();
    return row ?? null;
  });
}

// ─── Kiosk share token ────────────────────────────────────────────────────────

export async function getKioskToken(userId: string): Promise<string | null> {
  return traceDbQuery("getKioskToken", async () => {
    const db = getDb();
    const row = await db.select({ kioskToken: users.kioskToken }).from(users).where(eq(users.id, userId)).get();
    return row?.kioskToken ?? null;
  });
}

export async function setKioskToken(userId: string, token: string | null): Promise<void> {
  return traceDbQuery("setKioskToken", async () => {
    const db = getDb();
    await db.update(users).set({ kioskToken: token }).where(eq(users.id, userId)).run();
  });
}

export async function getUserByKioskToken(token: string): Promise<{ id: string } | null> {
  return traceDbQuery("getUserByKioskToken", async () => {
    const db = getDb();
    const row = await db.select({ id: users.id }).from(users).where(eq(users.kioskToken, token)).get();
    return row ?? null;
  });
}

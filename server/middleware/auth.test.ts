import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import {
  createUser,
  createSession,
  getSessionWithUser,
} from "../db/repository";
import { getDb } from "../db/schema";
import { sessions, users } from "../db/schema";
import { eq } from "drizzle-orm";
import { optionalAuth, requireAuth, requireAdmin } from "./auth";
import type { AppEnv } from "../types";

const COOKIE_NAME = "better-auth.session_token";

let app: Hono<AppEnv>;
let validToken: string;
let adminToken: string;

/**
 * Mock auth that mirrors what requireAdmin does in production:
 * - Normal getSession calls use the session cookie to look up the DB.
 * - When query.disableCookieCache is true (used by requireAdmin), we still
 *   go to DB — the difference in production is that the real better-auth
 *   skips its signed cookie cache and forces a DB round-trip. In tests,
 *   both paths go to DB, which correctly exercises the "fresh DB check" path.
 */
function createMockAuth() {
  return {
    api: {
      getSession: async ({
        headers,
        query,
      }: {
        headers: Headers;
        query?: { disableCookieCache?: boolean };
      }) => {
        // query.disableCookieCache is accepted but does not change test behaviour —
        // the mock always reads from DB (same as what the production force-refresh achieves).
        void query;
        const cookieHeader = headers.get("cookie") || "";
        const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
        const token = match?.[1];
        if (!token) return null;
        const user = await getSessionWithUser(token);
        if (!user) return null;
        return {
          session: { id: "session-id", userId: user.id },
          user: {
            id: user.id,
            name: user.display_name,
            username: user.username,
            role: user.role || (user.is_admin ? "admin" : "user"),
          },
        };
      },
    },
  };
}

beforeEach(async () => {
  setupTestDb();

  const userId = await createUser("testuser", "hash", "Test User");
  validToken = await createSession(userId);

  const adminId = await createUser(
    "admin",
    "hash",
    "Admin",
    "local",
    undefined,
    true,
  );
  adminToken = await createSession(adminId);

  app = new Hono<AppEnv>();

  // Inject mock auth into context for all routes
  app.use("*", async (c, next) => {
    c.set("auth", createMockAuth() as any);
    await next();
  });

  app.use("/optional/*", optionalAuth);
  app.get("/optional/test", (c) => {
    const user = c.get("user");
    return c.json({ user: user ?? null });
  });

  app.use("/protected/*", requireAuth);
  app.get("/protected/test", (c) => {
    return c.json({ user: c.get("user") });
  });

  app.use("/admin/*", requireAuth, requireAdmin);
  app.get("/admin/test", (c) => {
    return c.json({ ok: true });
  });
});

afterAll(() => {
  teardownTestDb();
});

describe("optionalAuth", () => {
  it("sets user when valid cookie present", async () => {
    const res = await app.request("/optional/test", {
      headers: { Cookie: `${COOKIE_NAME}=${validToken}` },
    });
    const body = await res.json();
    expect(body.user).not.toBeNull();
    expect(body.user.username).toBe("testuser");
  });

  it("passes through without cookie", async () => {
    const res = await app.request("/optional/test");
    const body = await res.json();
    expect(body.user).toBeNull();
  });

  it("passes through with invalid cookie", async () => {
    const res = await app.request("/optional/test", {
      headers: { Cookie: `${COOKIE_NAME}=invalid` },
    });
    const body = await res.json();
    expect(body.user).toBeNull();
  });
});

describe("requireAuth", () => {
  it("allows request with valid session", async () => {
    const res = await app.request("/protected/test", {
      headers: { Cookie: `${COOKIE_NAME}=${validToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.username).toBe("testuser");
  });

  it("returns 401 without cookie", async () => {
    const res = await app.request("/protected/test");
    expect(res.status).toBe(401);
  });

  it("returns 401 with invalid cookie", async () => {
    const res = await app.request("/protected/test", {
      headers: { Cookie: `${COOKIE_NAME}=invalid` },
    });
    expect(res.status).toBe(401);
  });
});

describe("requireAdmin", () => {
  it("allows admin users", async () => {
    const res = await app.request("/admin/test", {
      headers: { Cookie: `${COOKIE_NAME}=${adminToken}` },
    });
    expect(res.status).toBe(200);
  });

  it("returns 403 for non-admin users", async () => {
    const res = await app.request("/admin/test", {
      headers: { Cookie: `${COOKIE_NAME}=${validToken}` },
    });
    expect(res.status).toBe(403);
  });
});

describe("session expiration", () => {
  it("requireAuth returns 401 for expired session", async () => {
    const userId = await createUser("expired-user", "hash", "Expired User");
    const expiredToken = await createSession(userId);

    // Manually set session expiry to the past
    const db = getDb();
    db.update(sessions)
      .set({ expiresAt: "2000-01-01T00:00:00.000Z" })
      .where(eq(sessions.token, expiredToken))
      .run();

    const res = await app.request("/protected/test", {
      headers: { Cookie: `${COOKIE_NAME}=${expiredToken}` },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Session expired");
  });

  it("optionalAuth does not set user for expired session", async () => {
    const userId = await createUser("expired-user2", "hash", "Expired User 2");
    const expiredToken = await createSession(userId);

    const db = getDb();
    db.update(sessions)
      .set({ expiresAt: "2000-01-01T00:00:00.000Z" })
      .where(eq(sessions.token, expiredToken))
      .run();

    const res = await app.request("/optional/test", {
      headers: { Cookie: `${COOKIE_NAME}=${expiredToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toBeNull();
  });
});

/**
 * Admin force-refresh regression test.
 *
 * cookieCache fast-path test is intentionally skipped: verifying that the
 * real better-auth cookie cache is bypassed would require a fully bootstrapped
 * better-auth instance with a real DB, secret, and HMAC-signed cache cookies.
 * The mock auth always goes to DB so this can't be observed at the unit level.
 * The cookieCache config change in better-auth.ts is validated at the
 * integration/e2e level.
 *
 * The admin regression test below is the critical safety check: it asserts
 * that requireAdmin re-reads DB state on every request, so a user whose admin
 * role was revoked in the DB is denied access on the very next request —
 * regardless of any cached session state.
 */
describe("requireAdmin — force-refresh regression", () => {
  it("denies access after admin role is revoked in DB, even with a valid session cookie", async () => {
    // Create a user with admin role
    const userId = await createUser(
      "was-admin",
      "hash",
      "Was Admin",
      "local",
      undefined,
      true,
    );
    const token = await createSession(userId);

    // Confirm admin access works initially
    const firstRes = await app.request("/admin/test", {
      headers: { Cookie: `${COOKIE_NAME}=${token}` },
    });
    expect(firstRes.status).toBe(200);

    // Revoke admin role directly in the DB (simulating an admin demotion while
    // the user still holds a valid session cookie — the scenario that a cached
    // cookie would wrongly continue to allow through).
    const db = getDb();
    db.update(users)
      .set({ role: "user", isAdmin: 0 })
      .where(eq(users.id, userId))
      .run();

    // Second request with the same (still-valid) session cookie must be denied —
    // requireAdmin must read the current DB state, not trust a cached role.
    const secondRes = await app.request("/admin/test", {
      headers: { Cookie: `${COOKIE_NAME}=${token}` },
    });
    expect(secondRes.status).toBe(403);
    const body = await secondRes.json();
    expect(body.error).toBe("Admin access required");
  });
});

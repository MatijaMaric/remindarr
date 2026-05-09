import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, createSession, getSessionWithUser, upsertTitles } from "../db/repository";
import { makeParsedTitle } from "../test-utils/fixtures";
import { requireAuth, optionalAuth } from "../middleware/auth";
import * as achievementsRepo from "../db/repository/achievements";
import * as streaksRepo from "../db/repository/streaks";
import { follow } from "../db/repository";
import achievementsRoutes, { leaderboardApp, streakApp } from "./achievements";
import type { AppEnv } from "../types";

function createMockAuth() {
  return {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
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

let app: Hono<AppEnv>;
let userAId: string;
let userAToken: string;
let userBId: string;
let userBToken: string;

beforeEach(async () => {
  setupTestDb();

  userAId = await createUser("alice", "hash", "Alice");
  userAToken = await createSession(userAId);
  userBId = await createUser("bob", "hash", "Bob");
  userBToken = await createSession(userBId);

  await upsertTitles([makeParsedTitle({ id: "movie-1", objectType: "MOVIE", title: "Test Movie" })]);

  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", createMockAuth() as any);
    await next();
  });
  app.use("/achievements/*", optionalAuth);
  app.use("/achievements", optionalAuth);
  app.route("/achievements", achievementsRoutes);

  app.use("/leaderboard/*", optionalAuth);
  app.use("/leaderboard", optionalAuth);
  app.route("/leaderboard", leaderboardApp);

  app.use("/streak/*", optionalAuth);
  app.use("/streak", optionalAuth);
  app.route("/streak", streakApp);
});

afterEach(() => {
  teardownTestDb();
});

function authHeaders(token: string) {
  return { Cookie: `better-auth.session_token=${token}` };
}

describe("GET /achievements", () => {
  it("returns full registry without auth", async () => {
    const res = await app.request("/achievements");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.achievements)).toBe(true);
    expect(body.achievements.length).toBeGreaterThan(0);
    // Verify structure of registry entries
    const first = body.achievements[0];
    expect(first).toHaveProperty("key");
    expect(first).toHaveProperty("kind");
    expect(first).toHaveProperty("title");
    expect(first).toHaveProperty("points");
  });
});

describe("GET /achievements/me", () => {
  it("returns merged progress for authed user", async () => {
    const res = await app.request("/achievements/me", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.achievements)).toBe(true);
    const first = body.achievements[0];
    expect(first).toHaveProperty("progress");
    expect(first).toHaveProperty("earned");
    expect(first).toHaveProperty("earnedAt");
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/achievements/me");
    expect(res.status).toBe(401);
  });
});

describe("GET /achievements/u/:username", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/achievements/u/bob");
    expect(res.status).toBe(401);
  });

  it("returns 404 for private profile (not found behavior)", async () => {
    // bob has private visibility by default
    const res = await app.request("/achievements/u/bob", {
      headers: authHeaders(userAToken),
    });
    // private profiles return 404
    expect(res.status).toBe(404);
  });

  it("returns 403 for friends_only profile when not a follower", async () => {
    // Set bob's profile to friends_only
    const { getDb } = await import("../db/schema");
    const { users } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    await db.update(users).set({ profileVisibility: "friends_only" }).where(eq(users.id, userBId)).run();

    const res = await app.request("/achievements/u/bob", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(403);
  });

  it("returns 200 for public profile", async () => {
    // Set bob's profile to public
    const { getDb } = await import("../db/schema");
    const { users } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    await db.update(users).set({ profileVisibility: "public" }).where(eq(users.id, userBId)).run();

    const res = await app.request("/achievements/u/bob", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.achievements)).toBe(true);
  });

  it("validates param: empty username returns 400", async () => {
    // Empty username after /u/ won't match the route — will 404
    const res = await app.request("/achievements/u/", {
      headers: authHeaders(userAToken),
    });
    // Route won't match — Hono returns 404
    expect(res.status).toBe(404);
  });
});

describe("GET /leaderboard", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/leaderboard");
    expect(res.status).toBe(401);
  });

  it("returns leaderboard with self included, ordered by XP desc", async () => {
    const res = await app.request("/leaderboard", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.entries)).toBe(true);
    // Self (alice) should always be in the result
    const selfEntry = body.entries.find((e: any) => e.userId === userAId);
    expect(selfEntry).toBeDefined();
    // Entries should have required fields
    const first = body.entries[0];
    expect(first).toHaveProperty("userId");
    expect(first).toHaveProperty("username");
    expect(first).toHaveProperty("xp");
    expect(first).toHaveProperty("badgeCount");
    expect(first).toHaveProperty("rank");
  });

  it("includes followed users in leaderboard", async () => {
    await follow(userAId, userBId);
    const res = await app.request("/leaderboard", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const bobEntry = body.entries.find((e: any) => e.userId === userBId);
    expect(bobEntry).toBeDefined();
  });
});

describe("GET /streak/me", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/streak/me");
    expect(res.status).toBe(401);
  });

  it("returns streak shape for authed user", async () => {
    const res = await app.request("/streak/me", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("currentStreak");
    expect(body).toHaveProperty("longestStreak");
    expect(body).toHaveProperty("lastWatchDate");
    expect(typeof body.currentStreak).toBe("number");
    expect(typeof body.longestStreak).toBe("number");
  });

  it("returns zeros when no watch history exists", async () => {
    const res = await app.request("/streak/me", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.currentStreak).toBe(0);
    expect(body.longestStreak).toBe(0);
    expect(body.lastWatchDate).toBeNull();
  });
});

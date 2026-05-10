import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, createSession, getSessionWithUser, upsertTitles } from "../db/repository";
import { makeParsedTitle } from "../test-utils/fixtures";
import { optionalAuth } from "../middleware/auth";
import { upsertAchievementDef } from "../db/repository/achievements";
import { follow } from "../db/repository";
import achievementsRoutes, { leaderboardApp, streakApp } from "./achievements";
import { ACHIEVEMENTS } from "../achievements/definitions";
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
    // Verify base structure of registry entries
    const first = body.achievements[0];
    expect(first).toHaveProperty("key");
    expect(first).toHaveProperty("kind");
    expect(first).toHaveProperty("title");
    expect(first).toHaveProperty("points");
    // Verify enriched meta fields are present on every row
    for (const row of body.achievements) {
      expect(row).toHaveProperty("category");
      expect(row).toHaveProperty("family");
      expect(row).toHaveProperty("rungIndex");
      expect(row).toHaveProperty("tier");
      expect(row).toHaveProperty("repeatable");
      expect(typeof row.category).toBe("string");
      expect(["ladder", "one-shot"]).toContain(row.tier);
      expect(typeof row.repeatable).toBe("boolean");
    }
  });

  it("computes correct category for count_movies kind", async () => {
    const res = await app.request("/achievements");
    const body = await res.json();
    const movieRow = body.achievements.find((a: any) => a.key === "movies_10");
    expect(movieRow.category).toBe("watching");
    expect(movieRow.family).toBe("movies");
    expect(movieRow.tier).toBe("ladder");
    expect(movieRow.rungIndex).toBe(0);
  });

  it("computes correct rungIndex for ladder family", async () => {
    const res = await app.request("/achievements");
    const body = await res.json();
    const movies = body.achievements
      .filter((a: any) => a.family === "movies")
      .sort((a: any, b: any) => a.threshold - b.threshold);
    movies.forEach((row: any, idx: number) => {
      expect(row.rungIndex).toBe(idx);
    });
  });

  it("computes one-shot tier and null family for social achievements", async () => {
    const res = await app.request("/achievements");
    const body = await res.json();
    const socialRow = body.achievements.find((a: any) => a.key === "first_recommendation");
    expect(socialRow.category).toBe("social");
    expect(socialRow.family).toBeNull();
    expect(socialRow.tier).toBe("one-shot");
    expect(socialRow.rungIndex).toBeNull();
  });

  it("genre_explorer has null family and one-shot tier", async () => {
    const res = await app.request("/achievements");
    const body = await res.json();
    const explorerRow = body.achievements.find((a: any) => a.key === "genre_explorer");
    expect(explorerRow.category).toBe("genres");
    expect(explorerRow.family).toBeNull();
    expect(explorerRow.tier).toBe("one-shot");
    expect(explorerRow.rungIndex).toBeNull();
  });

  it("specific genre achievements have family and ladder tier", async () => {
    const res = await app.request("/achievements");
    const body = await res.json();
    const actionRow = body.achievements.find((a: any) => a.key === "genre_action_25");
    expect(actionRow.category).toBe("genres");
    expect(actionRow.family).toBe("genre_action");
    expect(actionRow.tier).toBe("ladder");
    expect(actionRow.rungIndex).toBe(0);
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
    // Verify enriched meta fields are present on every row
    for (const row of body.achievements) {
      expect(row).toHaveProperty("category");
      expect(row).toHaveProperty("family");
      expect(row).toHaveProperty("rungIndex");
      expect(row).toHaveProperty("tier");
      expect(row).toHaveProperty("repeatable");
      // /me-only extra fields
      expect(row).toHaveProperty("earnedCount");
      expect(row).toHaveProperty("lastEarnedAt");
      expect(row).toHaveProperty("nextRung");
      expect(row).toHaveProperty("rarity");
      expect(typeof row.earnedCount).toBe("number");
      expect(row.nextRung).toBeNull();
      expect(row.rarity).toBeNull();
    }
  });

  it("earnedCount is 0 when not earned, 1 when earned", async () => {
    // Seed the achievement definition (FK parent) then insert user row
    const moviesDef = ACHIEVEMENTS.find((a) => a.key === "movies_10")!;
    await upsertAchievementDef(moviesDef);

    const { getDb } = await import("../db/schema");
    const { userAchievements } = await import("../db/schema");
    const db = getDb();
    await db.insert(userAchievements).values({
      userId: userAId,
      achievementKey: "movies_10",
      progress: 10,
      earnedAt: new Date().toISOString(),
    }).run();

    const res = await app.request("/achievements/me", {
      headers: authHeaders(userAToken),
    });
    const body = await res.json();
    const earnedRow = body.achievements.find((a: any) => a.key === "movies_10");
    const unearnedRow = body.achievements.find((a: any) => a.key === "movies_50");
    expect(earnedRow.earnedCount).toBe(1);
    expect(earnedRow.lastEarnedAt).not.toBeNull();
    expect(unearnedRow.earnedCount).toBe(0);
    expect(unearnedRow.lastEarnedAt).toBeNull();
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

  it("returns meta fields on earned rows for public profile", async () => {
    const { getDb } = await import("../db/schema");
    const { users, userAchievements } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    await db.update(users).set({ profileVisibility: "public" }).where(eq(users.id, userBId)).run();

    // Seed the achievement definition (FK parent) then insert user row
    const streakDef = ACHIEVEMENTS.find((a) => a.key === "streak_7")!;
    await upsertAchievementDef(streakDef);

    // Give bob an earned achievement
    await db.insert(userAchievements).values({
      userId: userBId,
      achievementKey: "streak_7",
      progress: 7,
      earnedAt: new Date().toISOString(),
    }).run();

    const res = await app.request("/achievements/u/bob", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.achievements.length).toBe(1);
    const row = body.achievements[0];
    expect(row.category).toBe("streaks");
    expect(row.family).toBe("streaks");
    expect(row.tier).toBe("ladder");
    expect(typeof row.rungIndex).toBe("number");
    expect(row.repeatable).toBe(false);
    // /u/:username should NOT expose /me-only fields
    expect(row.earnedCount).toBeUndefined();
    expect(row.nextRung).toBeUndefined();
    expect(row.rarity).toBeUndefined();
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

describe("GET /achievements/:key/me", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/achievements/movies_10/me");
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid key pattern", async () => {
    const res = await app.request("/achievements/!!!/me", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown key", async () => {
    const res = await app.request("/achievements/nonexistent_key_xyz/me", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(404);
  });

  it("returns achievement detail with ladder rungs for movies_10", async () => {
    const res = await app.request("/achievements/movies_10/me", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.key).toBe("movies_10");
    expect(body).toHaveProperty("earned");
    expect(body).toHaveProperty("progress");
    expect(body).toHaveProperty("earnedAt");
    expect(body).toHaveProperty("earnedCount");
    expect(body).toHaveProperty("lastEarnedAt");
    expect(body).toHaveProperty("rarity");
    expect(body).toHaveProperty("ladder");
    expect(body).toHaveProperty("history");
    expect(Array.isArray(body.history)).toBe(true);
    // movies_10 is a ladder achievement so ladder should be non-null
    expect(body.ladder).not.toBeNull();
    expect(Array.isArray(body.ladder.rungs)).toBe(true);
    expect(body.ladder.rungs.length).toBeGreaterThan(0);
    // Each rung should have required fields
    const rung = body.ladder.rungs[0];
    expect(rung).toHaveProperty("key");
    expect(rung).toHaveProperty("title");
    expect(rung).toHaveProperty("threshold");
    expect(rung).toHaveProperty("rungIndex");
    expect(rung).toHaveProperty("points");
    expect(rung).toHaveProperty("earned");
    expect(rung).toHaveProperty("earnedAt");
  });

  it("history is empty for non-repeatable achievement", async () => {
    const res = await app.request("/achievements/movies_10/me", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.history).toEqual([]);
  });
});

describe("GET /achievements/u/:username/:key", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/achievements/u/alice/movies_10");
    expect(res.status).toBe(401);
  });

  it("returns 404 for private user", async () => {
    // bob is private by default
    const res = await app.request("/achievements/u/bob/movies_10", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 for unknown key on public user", async () => {
    const { getDb } = await import("../db/schema");
    const { users } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    await db.update(users).set({ profileVisibility: "public" }).where(eq(users.id, userBId)).run();

    const res = await app.request("/achievements/u/bob/nonexistent_key_xyz", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(404);
  });

  it("returns achievement detail for public user", async () => {
    const { getDb } = await import("../db/schema");
    const { users } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    await db.update(users).set({ profileVisibility: "public" }).where(eq(users.id, userBId)).run();

    const res = await app.request("/achievements/u/bob/movies_10", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.key).toBe("movies_10");
    expect(body).toHaveProperty("earned");
    expect(body).toHaveProperty("earnedAt");
    // ladder and history are hidden for other users
    expect(body.ladder).toBeNull();
    expect(body.history).toEqual([]);
  });

  it("returns 403 for friends_only profile when not following", async () => {
    const { getDb } = await import("../db/schema");
    const { users } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    await db.update(users).set({ profileVisibility: "friends_only" }).where(eq(users.id, userBId)).run();

    const res = await app.request("/achievements/u/bob/movies_10", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(403);
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

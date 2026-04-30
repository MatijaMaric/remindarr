import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, createSession, getSessionWithUser, trackTitle } from "../db/repository";
import { requireAuth } from "../middleware/auth";
import { getDb } from "../db/schema";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import overlapApp from "./overlap";
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
let aliceId: string;
let aliceToken: string;
let bobId: string;
let _bobToken: string;
let charlieId: string;
let charlieToken: string;

function authHeaders(token: string) {
  return { Cookie: `better-auth.session_token=${token}` };
}

async function setProfileVisibility(userId: string, visibility: "public" | "friends_only" | "private") {
  const db = getDb();
  await db.update(users).set({ profileVisibility: visibility }).where(eq(users.id, userId)).run();
}

async function follow(followerId: string, followingId: string) {
  const { follow: doFollow } = await import("../db/repository/follows");
  await doFollow(followerId, followingId);
}

async function insertTitle(id: string) {
  const db = getDb();
  const { titles } = await import("../db/schema");
  await db.insert(titles).values({
    id,
    objectType: "MOVIE",
    title: `Title ${id}`,
    originalTitle: null,
    releaseYear: 2024,
    releaseDate: "2024-01-01",
    runtimeMinutes: 120,
    shortDescription: null,
    imdbId: null,
    tmdbId: null,
    posterUrl: null,
    ageCertification: null,
    originalLanguage: "en",
    tmdbUrl: null,
  }).onConflictDoNothing().run();
}

beforeEach(async () => {
  setupTestDb();

  aliceId = await createUser("alice", "hash", "Alice");
  aliceToken = await createSession(aliceId);
  bobId = await createUser("bob", "hash", "Bob");
  _bobToken = await createSession(bobId);
  charlieId = await createUser("charlie", "hash", "Charlie");
  charlieToken = await createSession(charlieId);

  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", createMockAuth() as any);
    await next();
  });
  app.use("/overlap/*", requireAuth);
  app.route("/overlap", overlapApp);
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /overlap/:friendUsername — happy path", () => {
  it("returns 200 with intersection for a mutual friend", async () => {
    // Setup: make bob public, alice and bob both track title-1
    await setProfileVisibility(bobId, "public");
    await insertTitle("title-1");
    await insertTitle("title-2");
    await trackTitle("title-1", aliceId);
    await trackTitle("title-1", bobId);
    await trackTitle("title-2", bobId);

    const res = await app.request("/overlap/bob", {
      headers: authHeaders(aliceToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.counts.intersection).toBe(1);
    expect(body.counts.viewerOnly).toBe(0);
    expect(body.counts.friendOnly).toBe(1);
    expect(body.titles).toHaveLength(1);
    expect(body.titles[0].id).toBe("title-1");
    expect(body.friendUser.username).toBe("bob");
    expect(Array.isArray(body.sharedProviders)).toBe(true);
  });

  it("returns 200 with empty titles array when no overlap", async () => {
    await setProfileVisibility(bobId, "public");
    await insertTitle("title-a");
    await insertTitle("title-b");
    await trackTitle("title-a", aliceId);
    await trackTitle("title-b", bobId);

    const res = await app.request("/overlap/bob", {
      headers: authHeaders(aliceToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.counts.intersection).toBe(0);
    expect(body.titles).toHaveLength(0);
  });
});

describe("GET /overlap/:friendUsername — visibility", () => {
  it("returns 403 when friend has profileVisibility='private'", async () => {
    await setProfileVisibility(bobId, "private");

    const res = await app.request("/overlap/bob", {
      headers: authHeaders(aliceToken),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("private");
  });

  it("returns 403 when friend has profileVisibility='friends_only' and not mutual", async () => {
    await setProfileVisibility(bobId, "friends_only");
    // Alice follows Bob but not mutual

    const res = await app.request("/overlap/bob", {
      headers: authHeaders(aliceToken),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("mutual");
  });

  it("returns 200 when friend has profileVisibility='friends_only' and IS mutual", async () => {
    await setProfileVisibility(bobId, "friends_only");
    // Make mutual follows: alice→bob, bob→alice
    await follow(aliceId, bobId);
    await follow(bobId, aliceId);

    const res = await app.request("/overlap/bob", {
      headers: authHeaders(aliceToken),
    });
    expect(res.status).toBe(200);
  });

  it("returns 200 when friend has profileVisibility='public' and not mutual", async () => {
    await setProfileVisibility(bobId, "public");
    // No follows set up — alice and bob are strangers

    const res = await app.request("/overlap/bob", {
      headers: authHeaders(aliceToken),
    });
    expect(res.status).toBe(200);
  });

  it("public visitor only sees public tracked titles in intersection", async () => {
    // Bob is public, bob has one public and one private tracked title
    await setProfileVisibility(bobId, "public");
    await insertTitle("title-pub");
    await insertTitle("title-priv");
    await trackTitle("title-pub", bobId);
    await trackTitle("title-priv", bobId);
    // tracked.public defaults to 1; set title-priv to private (public=0) for bob
    const db = getDb();
    const { tracked } = await import("../db/schema");
    await db.update(tracked)
      .set({ public: 0 })
      .where(eq(tracked.titleId, "title-priv"))
      .run();
    // Charlie tracks both
    await trackTitle("title-pub", charlieId);
    await trackTitle("title-priv", charlieId);
    // Charlie is NOT mutual with bob — charlie is logged in
    const res = await app.request("/overlap/bob", {
      headers: authHeaders(charlieToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Only title-pub should appear in intersection (the public one)
    expect(body.counts.intersection).toBe(1);
    expect(body.titles[0].id).toBe("title-pub");
  });
});

describe("GET /overlap/:friendUsername — 404", () => {
  it("returns 404 for nonexistent user", async () => {
    const res = await app.request("/overlap/nonexistent", {
      headers: authHeaders(aliceToken),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("User not found");
  });
});

describe("GET /overlap/:friendUsername — auth", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/overlap/bob");
    expect(res.status).toBe(401);
  });
});

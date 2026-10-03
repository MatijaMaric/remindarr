import {
  describe,
  it,
  expect,
  beforeEach,
  afterAll,
  afterEach,
  spyOn,
} from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import {
  createUser,
  createSession,
  getSessionWithUser,
  upsertTitles,
} from "../db/repository";
import * as repository from "../db/repository";
import Sentry from "../sentry";
import { makeParsedTitle } from "../test-utils/fixtures";
import { requireAuth, optionalAuth } from "../middleware/auth";
import socialApp from "./social";
import * as tmdbClient from "../tmdb/client";
import { CONFIG } from "../config";
import {
  getFollowedPeople,
  getPersonFollowers,
} from "../db/repository/person-follows";
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

  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", createMockAuth() as any);
    await next();
  });
  app.use("/social/follow/*", requireAuth);
  app.use("/social/follow", requireAuth);
  app.use("/social/followers/*", optionalAuth);
  app.use("/social/followers", optionalAuth);
  app.use("/social/following/*", optionalAuth);
  app.use("/social/following", optionalAuth);
  app.use("/social/friends-loved", requireAuth);
  app.route("/social", socialApp);
});

afterAll(() => {
  teardownTestDb();
});

function authHeaders(token: string) {
  return { Cookie: `better-auth.session_token=${token}` };
}

describe("POST /social/follow/:userId", () => {
  it("follows a user successfully", async () => {
    const res = await app.request(`/social/follow/${userBId}`, {
      method: "POST",
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 400 when trying to follow yourself", async () => {
    const res = await app.request(`/social/follow/${userAId}`, {
      method: "POST",
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Cannot follow yourself");
  });

  it("returns 404 when target user does not exist", async () => {
    const res = await app.request(
      "/social/follow/00000000-0000-4000-8000-000000000000",
      {
        method: "POST",
        headers: authHeaders(userAToken),
      },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("User not found");
  });

  it("rejects a malformed :userId with 400", async () => {
    const res = await app.request("/social/follow/invalid%20id", {
      method: "POST",
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("is idempotent — following twice returns 200", async () => {
    await app.request(`/social/follow/${userBId}`, {
      method: "POST",
      headers: authHeaders(userAToken),
    });
    const res = await app.request(`/social/follow/${userBId}`, {
      method: "POST",
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(`/social/follow/${userBId}`, {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });
});

describe("POST/DELETE /social/follow/person/:personId", () => {
  const originalKey = CONFIG.TMDB_API_KEY;
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    CONFIG.TMDB_API_KEY = "test";
    fetchSpy = spyOn(tmdbClient, "fetchPersonDetails").mockResolvedValue({
      id: 31,
      name: "Tom Hanks",
      profile_path: "/tom.jpg",
      combined_credits: {
        cast: [{ id: 1, media_type: "movie", title: "Big", character: "Josh" }],
        crew: [{ id: 7, media_type: "tv", name: "Band", job: "Producer" }],
      },
    } as any);
  });

  afterEach(() => {
    CONFIG.TMDB_API_KEY = originalKey;
    fetchSpy.mockRestore();
  });

  it("follows a person and snapshots their current credits", async () => {
    const res = await app.request("/social/follow/person/31", {
      method: "POST",
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    expect(await getFollowedPeople(userAId)).toEqual([
      { id: 31, name: "Tom Hanks", profile_path: "/tom.jpg" },
    ]);
    const [follower] = await getPersonFollowers(31);
    expect(follower.seenCredits).toEqual(["movie:1", "tv:7"]);
  });

  it("unfollows a person", async () => {
    await app.request("/social/follow/person/31", {
      method: "POST",
      headers: authHeaders(userAToken),
    });
    const res = await app.request("/social/follow/person/31", {
      method: "DELETE",
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    expect(await getFollowedPeople(userAId)).toEqual([]);
  });

  it("requires authentication", async () => {
    const res = await app.request("/social/follow/person/31", {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when TMDB has no such person", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("404"));
    const res = await app.request("/social/follow/person/31", {
      method: "POST",
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(404);
    expect(await getFollowedPeople(userAId)).toEqual([]);
  });

  describe("validation", () => {
    it("rejects a non-numeric personId", async () => {
      const res = await app.request("/social/follow/person/abc", {
        method: "POST",
        headers: authHeaders(userAToken),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.issues).toBeInstanceOf(Array);
    });
  });
});

describe("DELETE /social/follow/:userId", () => {
  it("unfollows a user successfully", async () => {
    // Follow first
    await app.request(`/social/follow/${userBId}`, {
      method: "POST",
      headers: authHeaders(userAToken),
    });

    const res = await app.request(`/social/follow/${userBId}`, {
      method: "DELETE",
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify unfollowed
    const followersRes = await app.request(`/social/followers/${userBId}`);
    const followersBody = await followersRes.json();
    expect(followersBody.followers).toHaveLength(0);
  });

  it("returns 200 when unfollowing a user not being followed", async () => {
    const res = await app.request(`/social/follow/${userBId}`, {
      method: "DELETE",
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(`/social/follow/${userBId}`, {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /social/followers", () => {
  it("returns current user's followers", async () => {
    // B follows A
    await app.request(`/social/follow/${userAId}`, {
      method: "POST",
      headers: authHeaders(userBToken),
    });

    const res = await app.request("/social/followers", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.followers).toHaveLength(1);
    expect(body.count).toBe(1);
    expect(body.followers[0].username).toBe("bob");
    expect(body.followers[0].display_name).toBe("Bob");
    expect(body.followers[0].id).toBe(userBId);
  });

  it("returns empty list when no followers", async () => {
    const res = await app.request("/social/followers", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.followers).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/social/followers");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Authentication required");
  });
});

describe("GET /social/following", () => {
  it("returns current user's following list", async () => {
    // A follows B
    await app.request(`/social/follow/${userBId}`, {
      method: "POST",
      headers: authHeaders(userAToken),
    });

    const res = await app.request("/social/following", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.following).toHaveLength(1);
    expect(body.count).toBe(1);
    expect(body.following[0].username).toBe("bob");
    expect(body.following[0].id).toBe(userBId);
  });

  it("returns empty list when not following anyone", async () => {
    const res = await app.request("/social/following", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.following).toHaveLength(0);
    expect(body.count).toBe(0);
  });
});

describe("GET /social/followers/:userId", () => {
  it("returns followers for a specific user (public)", async () => {
    // A follows B
    await app.request(`/social/follow/${userBId}`, {
      method: "POST",
      headers: authHeaders(userAToken),
    });

    const res = await app.request(`/social/followers/${userBId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.followers).toHaveLength(1);
    expect(body.count).toBe(1);
    expect(body.followers[0].username).toBe("alice");
    expect(body.followers[0].id).toBe(userAId);
    expect(body.followers[0].display_name).toBe("Alice");
    expect(body.followers[0]).toHaveProperty("image");
  });

  it("returns empty list for user with no followers", async () => {
    const res = await app.request(`/social/followers/${userAId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.followers).toHaveLength(0);
    expect(body.count).toBe(0);
  });
});

describe("GET /social/following/:userId", () => {
  it("returns following list for a specific user (public)", async () => {
    // A follows B
    await app.request(`/social/follow/${userBId}`, {
      method: "POST",
      headers: authHeaders(userAToken),
    });

    const res = await app.request(`/social/following/${userAId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.following).toHaveLength(1);
    expect(body.count).toBe(1);
    expect(body.following[0].username).toBe("bob");
    expect(body.following[0].id).toBe(userBId);
    expect(body.following[0]).toHaveProperty("image");
  });

  it("returns empty list for user following nobody", async () => {
    const res = await app.request(`/social/following/${userAId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.following).toHaveLength(0);
    expect(body.count).toBe(0);
  });
});

describe("GET /social/friends-loved", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/social/friends-loved");
    expect(res.status).toBe(401);
  });

  it("returns { items: [] } when user follows nobody (happy path)", async () => {
    const res = await app.request("/social/friends-loved", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("items");
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.items).toHaveLength(0);
  });

  it("returns loved titles from followed users", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", title: "Test Movie" }),
    ]);

    // A follows B; B rates movie-1
    await app.request(`/social/follow/${userBId}`, {
      method: "POST",
      headers: authHeaders(userAToken),
    });

    // Rate via the DB directly through the repository
    const { rateTitle } = await import("../db/repository/ratings");
    await rateTitle(userBId, "movie-1", "LOVE");

    const res = await app.request("/social/friends-loved", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("movie-1");
  });

  it("clamps limit to 50 at most", async () => {
    const res = await app.request("/social/friends-loved?limit=100", {
      headers: authHeaders(userAToken),
    });
    // limit=100 exceeds max; zod coerces it down — expect 400 (validation) since 100 > 50
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("accepts limit within range", async () => {
    const res = await app.request("/social/friends-loved?limit=10", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("items");
  });

  it("returns 500 with a generic message and captures the error when the DB query throws", async () => {
    const spy = spyOn(
      repository,
      "getFriendsLovedThisWeek",
    ).mockRejectedValueOnce(new Error("D1 connection lost"));
    const captureSpy = spyOn(Sentry, "captureException");
    const res = await app.request("/social/friends-loved", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to load friends-loved");
    expect(captureSpy).toHaveBeenCalled();
    spy.mockRestore();
    captureSpy.mockRestore();
  });
});

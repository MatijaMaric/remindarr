import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, createSession, getSessionWithUser, follow } from "../db/repository";
import { getRawDb } from "../db/bun-db";
import { optionalAuth } from "../middleware/auth";
import ratingsApp from "./ratings";
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

  // Insert test titles for FK constraint
  insertTitle("movie-123");
  insertTitle("movie-999");

  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", createMockAuth() as any);
    await next();
  });
  app.use("/ratings/*", optionalAuth);
  app.use("/ratings", optionalAuth);
  app.route("/ratings", ratingsApp);
});

afterAll(() => {
  teardownTestDb();
});

function authHeaders(token: string) {
  return { Cookie: `better-auth.session_token=${token}` };
}

function insertTitle(id: string) {
  const db = getRawDb();
  db.prepare(
    `INSERT INTO titles (id, object_type, title, release_date) VALUES (?, 'MOVIE', ?, '2024-01-01')`
  ).run(id, `Title ${id}`);
}

describe("POST /ratings/:titleId", () => {
  it("rates a title successfully", async () => {
    const res = await app.request("/ratings/movie-123", {
      method: "POST",
      headers: {
        ...authHeaders(userAToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rating: "LOVE" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.rating).toBe("LOVE");
  });

  it("updates an existing rating", async () => {
    // Rate first
    await app.request("/ratings/movie-123", {
      method: "POST",
      headers: {
        ...authHeaders(userAToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rating: "LIKE" }),
    });

    // Update rating
    const res = await app.request("/ratings/movie-123", {
      method: "POST",
      headers: {
        ...authHeaders(userAToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rating: "LOVE" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.rating).toBe("LOVE");

    // Verify the rating was updated
    const getRes = await app.request("/ratings/movie-123", {
      headers: authHeaders(userAToken),
    });
    const getBody = await getRes.json();
    expect(getBody.user_rating).toBe("LOVE");
  });

  it("returns 400 for invalid rating value", async () => {
    const res = await app.request("/ratings/movie-123", {
      method: "POST",
      headers: {
        ...authHeaders(userAToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rating: "INVALID" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 for missing rating value", async () => {
    const res = await app.request("/ratings/movie-123", {
      method: "POST",
      headers: {
        ...authHeaders(userAToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/ratings/movie-123", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: "LOVE" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /ratings/:titleId", () => {
  it("removes a rating successfully", async () => {
    // Rate first
    await app.request("/ratings/movie-123", {
      method: "POST",
      headers: {
        ...authHeaders(userAToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rating: "LIKE" }),
    });

    // Delete rating
    const res = await app.request("/ratings/movie-123", {
      method: "DELETE",
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify rating was removed
    const getRes = await app.request("/ratings/movie-123", {
      headers: authHeaders(userAToken),
    });
    const getBody = await getRes.json();
    expect(getBody.user_rating).toBeNull();
  });

  it("returns 200 when removing a non-existent rating", async () => {
    const res = await app.request("/ratings/movie-123", {
      method: "DELETE",
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/ratings/movie-123", {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /ratings/:titleId", () => {
  it("returns aggregated ratings and user rating when authenticated", async () => {
    // Alice rates LOVE
    await app.request("/ratings/movie-123", {
      method: "POST",
      headers: {
        ...authHeaders(userAToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rating: "LOVE" }),
    });

    // Bob rates LIKE
    await app.request("/ratings/movie-123", {
      method: "POST",
      headers: {
        ...authHeaders(userBToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rating: "LIKE" }),
    });

    const res = await app.request("/ratings/movie-123", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.user_rating).toBe("LOVE");
    expect(body.aggregated.LOVE).toBe(1);
    expect(body.aggregated.LIKE).toBe(1);
    expect(body.aggregated.HATE).toBe(0);
    expect(body.aggregated.DISLIKE).toBe(0);
  });

  it("returns null user_rating when not authenticated", async () => {
    // Alice rates
    await app.request("/ratings/movie-123", {
      method: "POST",
      headers: {
        ...authHeaders(userAToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rating: "LOVE" }),
    });

    const res = await app.request("/ratings/movie-123");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.user_rating).toBeNull();
    expect(body.aggregated.LOVE).toBe(1);
    expect(body.friends_ratings).toHaveLength(0);
  });

  it("returns friends ratings from followed users", async () => {
    // Alice follows Bob
    await follow(userAId, userBId);

    // Bob rates the title
    await app.request("/ratings/movie-123", {
      method: "POST",
      headers: {
        ...authHeaders(userBToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rating: "LIKE" }),
    });

    // Alice gets ratings — should see Bob's rating as friend
    const res = await app.request("/ratings/movie-123", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.friends_ratings).toHaveLength(1);
    expect(body.friends_ratings[0].rating).toBe("LIKE");
    expect(body.friends_ratings[0].user.username).toBe("bob");
    expect(body.friends_ratings[0].user.display_name).toBe("Bob");
    expect(body.friends_ratings[0].user.id).toBe(userBId);
  });

  it("returns empty friends ratings when not following anyone", async () => {
    // Bob rates the title
    await app.request("/ratings/movie-123", {
      method: "POST",
      headers: {
        ...authHeaders(userBToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ rating: "LIKE" }),
    });

    // Alice gets ratings — should not see Bob since not following
    const res = await app.request("/ratings/movie-123", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.friends_ratings).toHaveLength(0);
  });

  it("returns zero counts for unrated title", async () => {
    const res = await app.request("/ratings/movie-999");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.user_rating).toBeNull();
    expect(body.aggregated).toEqual({ HATE: 0, DISLIKE: 0, LIKE: 0, LOVE: 0 });
    expect(body.friends_ratings).toHaveLength(0);
  });
});

describe("validation", () => {
  it("rejects POST /:titleId with unknown rating enum value", async () => {
    const res = await app.request("/ratings/movie-123", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ rating: "OKAY" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("rejects POST /episode/:episodeId when episodeId is not numeric", async () => {
    const res = await app.request("/ratings/episode/abc", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ rating: "LIKE" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects POST /episode/:episodeId with review over 500 chars", async () => {
    const res = await app.request("/ratings/episode/1", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ rating: "LIKE", review: "x".repeat(501) }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });
});

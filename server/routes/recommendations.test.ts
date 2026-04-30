import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, createSession, getSessionWithUser, follow } from "../db/repository";
import { getRawDb } from "../db/bun-db";
import { requireAuth } from "../middleware/auth";
import recommendationsApp from "./recommendations";
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
let userCId: string;
let userCToken: string;

beforeEach(async () => {
  setupTestDb();

  userAId = await createUser("alice", "hash", "Alice");
  userAToken = await createSession(userAId);
  userBId = await createUser("bob", "hash", "Bob");
  userBToken = await createSession(userBId);
  userCId = await createUser("carol", "hash", "Carol");
  userCToken = await createSession(userCId);

  // Insert test titles for FK constraint
  insertTitle("movie-123", "MOVIE", "Test Movie");
  insertTitle("show-456", "SHOW", "Test Show");

  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", createMockAuth() as any);
    await next();
  });
  app.use("/recommendations/*", requireAuth);
  app.use("/recommendations", requireAuth);
  app.route("/recommendations", recommendationsApp);
});

afterAll(() => {
  teardownTestDb();
});

function authHeaders(token: string) {
  return { Cookie: `better-auth.session_token=${token}` };
}

function insertTitle(id: string, objectType = "MOVIE", name = "Title") {
  const db = getRawDb();
  db.prepare(
    `INSERT INTO titles (id, object_type, title, release_date, poster_url) VALUES (?, ?, ?, '2024-01-01', 'https://example.com/poster.jpg')`
  ).run(id, objectType, name);
}

describe("POST /recommendations", () => {
  it("creates a recommendation successfully", async () => {
    const res = await app.request("/recommendations", {
      method: "POST",
      headers: {
        ...authHeaders(userAToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ titleId: "movie-123", message: "Great film!" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBeDefined();
  });

  it("creates a recommendation without a message", async () => {
    const res = await app.request("/recommendations", {
      method: "POST",
      headers: {
        ...authHeaders(userAToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ titleId: "movie-123" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it("returns 409 when duplicate recommendation", async () => {
    await app.request("/recommendations", {
      method: "POST",
      headers: {
        ...authHeaders(userAToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ titleId: "movie-123" }),
    });

    const res = await app.request("/recommendations", {
      method: "POST",
      headers: {
        ...authHeaders(userAToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ titleId: "movie-123" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("already recommended");
  });

  it("returns 400 when titleId is missing", async () => {
    const res = await app.request("/recommendations", {
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
    const res = await app.request("/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "movie-123" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /recommendations", () => {
  it("lists discovery feed (recommendations from followed users)", async () => {
    // Bob follows Alice
    await follow(userBId, userAId);

    // Alice recommends a movie
    await app.request("/recommendations", {
      method: "POST",
      headers: {
        ...authHeaders(userAToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ titleId: "movie-123", message: "Watch this!" }),
    });

    // Bob retrieves feed
    const res = await app.request("/recommendations", {
      headers: authHeaders(userBToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recommendations).toHaveLength(1);
    expect(body.count).toBe(1);

    const rec = body.recommendations[0];
    expect(rec.from_user.id).toBe(userAId);
    expect(rec.from_user.username).toBe("alice");
    expect(rec.from_user.display_name).toBe("Alice");
    expect(rec.title.id).toBe("movie-123");
    expect(rec.title.title).toBe("Test Movie");
    expect(rec.title.object_type).toBe("MOVIE");
    expect(rec.title.poster_url).toBe("https://example.com/poster.jpg");
    expect(rec.message).toBe("Watch this!");
    expect(rec.read_at).toBeNull();
  });

  it("does not show recommendations from unfollowed users", async () => {
    // Alice recommends but Bob doesn't follow Alice
    await app.request("/recommendations", {
      method: "POST",
      headers: {
        ...authHeaders(userAToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ titleId: "movie-123" }),
    });

    const res = await app.request("/recommendations", {
      headers: authHeaders(userBToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recommendations).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  it("supports pagination via limit and offset", async () => {
    await follow(userBId, userAId);

    // Alice recommends two titles
    await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "movie-123" }),
    });
    await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "show-456" }),
    });

    // Get first page (limit 1)
    const res = await app.request("/recommendations?limit=1&offset=0", {
      headers: authHeaders(userBToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recommendations).toHaveLength(1);
    expect(body.count).toBe(2);
  });

  it("returns empty list when no recommendations from followed users", async () => {
    const res = await app.request("/recommendations", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recommendations).toHaveLength(0);
    expect(body.count).toBe(0);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/recommendations");
    expect(res.status).toBe(401);
  });
});

describe("GET /recommendations/sent", () => {
  it("lists user's own recommendations", async () => {
    await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "movie-123", message: "Enjoy!" }),
    });

    const res = await app.request("/recommendations/sent", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recommendations).toHaveLength(1);

    const rec = body.recommendations[0];
    expect(rec.title.id).toBe("movie-123");
    expect(rec.message).toBe("Enjoy!");
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/recommendations/sent");
    expect(res.status).toBe(401);
  });
});

describe("GET /recommendations/check/:titleId", () => {
  it("returns recommended true if user already recommended", async () => {
    await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "movie-123" }),
    });

    const res = await app.request("/recommendations/check/movie-123", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recommended).toBe(true);
    expect(body.id).toBeDefined();
  });

  it("returns recommended false if user has not recommended", async () => {
    const res = await app.request("/recommendations/check/movie-123", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recommended).toBe(false);
    expect(body.id).toBeNull();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/recommendations/check/movie-123");
    expect(res.status).toBe(401);
  });
});

describe("POST /recommendations/:id/read", () => {
  it("marks a recommendation as read (per-user)", async () => {
    await follow(userBId, userAId);

    // Alice recommends
    const createRes = await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "movie-123" }),
    });
    const { id } = await createRes.json();

    // Bob marks as read
    const res = await app.request(`/recommendations/${id}/read`, {
      method: "POST",
      headers: authHeaders(userBToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify it's marked as read in Bob's feed
    const listRes = await app.request("/recommendations", {
      headers: authHeaders(userBToken),
    });
    const listBody = await listRes.json();
    expect(listBody.recommendations[0].read_at).not.toBeNull();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/recommendations/some-id/read", {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /recommendations/:id", () => {
  it("creator can delete their recommendation", async () => {
    const createRes = await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "movie-123" }),
    });
    const { id } = await createRes.json();

    // Alice (creator) deletes
    const res = await app.request(`/recommendations/${id}`, {
      method: "DELETE",
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify it's gone
    const listRes = await app.request("/recommendations/sent", {
      headers: authHeaders(userAToken),
    });
    const listBody = await listRes.json();
    expect(listBody.recommendations).toHaveLength(0);
  });

  it("non-creator cannot delete", async () => {
    const createRes = await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "movie-123" }),
    });
    const { id } = await createRes.json();

    // Bob tries to delete Alice's recommendation (should not work)
    await app.request(`/recommendations/${id}`, {
      method: "DELETE",
      headers: authHeaders(userBToken),
    });

    // Verify it's still there
    const listRes = await app.request("/recommendations/sent", {
      headers: authHeaders(userAToken),
    });
    const listBody = await listRes.json();
    expect(listBody.recommendations).toHaveLength(1);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/recommendations/some-id", {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });
});

describe("validation", () => {
  it("rejects POST / with empty titleId via zod", async () => {
    const res = await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("rejects POST / when message exceeds 500 chars", async () => {
    const res = await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "movie-123", message: "x".repeat(501) }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects GET / with invalid limit", async () => {
    const res = await app.request("/recommendations?limit=9999", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects GET / with negative offset", async () => {
    const res = await app.request("/recommendations?offset=-1", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });
});

describe("POST /recommendations — targeted", () => {
  it("allows sending to a followed user", async () => {
    // Alice follows Bob
    await follow(userAId, userBId);

    const res = await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "movie-123", message: "Just for you!", targetUserId: userBId }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.id).toBeDefined();
  });

  it("returns 400 when targeting yourself", async () => {
    const res = await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "movie-123", targetUserId: userAId }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("yourself");
  });

  it("returns 403 when targeting a non-followed user", async () => {
    // Alice does not follow Carol
    const res = await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "movie-123", targetUserId: userCId }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("follow");
  });

  it("allows same title targeted to different recipients", async () => {
    await follow(userAId, userBId);
    await follow(userAId, userCId);

    const resB = await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "movie-123", targetUserId: userBId }),
    });
    expect(resB.status).toBe(201);

    const resC = await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "movie-123", targetUserId: userCId }),
    });
    expect(resC.status).toBe(201);
  });

  it("returns 409 for duplicate targeted recommendation to same recipient", async () => {
    await follow(userAId, userBId);

    await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "movie-123", targetUserId: userBId }),
    });

    const res = await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "movie-123", targetUserId: userBId }),
    });
    expect(res.status).toBe(409);
  });

  it("targeted rec appears in recipient feed even without following the sender", async () => {
    // Alice follows Bob so she can target him; Bob does NOT follow Alice
    await follow(userAId, userBId);

    await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "movie-123", message: "Direct rec!", targetUserId: userBId }),
    });

    // Bob should see it in his feed despite not following Alice
    const res = await app.request("/recommendations", {
      headers: authHeaders(userBToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recommendations).toHaveLength(1);
    expect(body.recommendations[0].is_targeted).toBe(true);
    expect(body.recommendations[0].message).toBe("Direct rec!");
  });

  it("targeted rec does NOT appear in a third-party's feed", async () => {
    // Alice follows Bob so she can target him; Carol follows Alice
    await follow(userAId, userBId);
    await follow(userCId, userAId);

    // Alice sends a targeted rec to Bob
    await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "movie-123", targetUserId: userBId }),
    });

    // Carol follows Alice but should NOT see the targeted rec (it's for Bob)
    const res = await app.request("/recommendations", {
      headers: authHeaders(userCToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recommendations).toHaveLength(0);
  });

  it("broadcast rec is visible to all followers, targeted rec is only visible to recipient", async () => {
    // Carol follows Alice
    await follow(userCId, userAId);
    // Alice follows Bob so she can target him
    await follow(userAId, userBId);

    // Alice sends a broadcast
    await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "movie-123" }),
    });

    // Alice sends a targeted rec to Bob
    await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "show-456", targetUserId: userBId }),
    });

    // Carol (follower) sees the broadcast but not the targeted rec
    const carolRes = await app.request("/recommendations", {
      headers: authHeaders(userCToken),
    });
    const carolBody = await carolRes.json();
    expect(carolBody.recommendations).toHaveLength(1);
    expect(carolBody.recommendations[0].is_targeted).toBeFalsy();

    // Bob sees the targeted rec but not the broadcast (Bob doesn't follow Alice)
    const bobRes = await app.request("/recommendations", {
      headers: authHeaders(userBToken),
    });
    const bobBody = await bobRes.json();
    expect(bobBody.recommendations).toHaveLength(1);
    expect(bobBody.recommendations[0].is_targeted).toBe(true);
  });
});

describe("GET /recommendations — targeted visibility", () => {
  it("shows targeted recs in recipient feed even without follow", async () => {
    await follow(userAId, userBId); // Alice follows Bob so she can target him

    await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "movie-123", targetUserId: userBId }),
    });

    const res = await app.request("/recommendations", {
      headers: authHeaders(userBToken),
    });
    const body = await res.json();
    expect(body.recommendations).toHaveLength(1);
    expect(body.count).toBe(1);
  });
});

describe("validation — targetUserId", () => {
  it("rejects POST / with targetUserId as a number (not string)", async () => {
    const res = await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "movie-123", targetUserId: 123 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });
});

describe("GET /recommendations/count", () => {
  it("returns unread count from followed users", async () => {
    await follow(userBId, userAId);

    // Alice recommends two titles
    await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "movie-123" }),
    });
    const createRes = await app.request("/recommendations", {
      method: "POST",
      headers: { ...authHeaders(userAToken), "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "show-456" }),
    });
    const { id: secondId } = await createRes.json();

    // Check unread count for Bob
    const res = await app.request("/recommendations/count", {
      headers: authHeaders(userBToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(2);

    // Mark one as read
    await app.request(`/recommendations/${secondId}/read`, {
      method: "POST",
      headers: authHeaders(userBToken),
    });

    // Check count again
    const res2 = await app.request("/recommendations/count", {
      headers: authHeaders(userBToken),
    });
    const body2 = await res2.json();
    expect(body2.count).toBe(1);
  });

  it("returns 0 when not following anyone", async () => {
    const res = await app.request("/recommendations/count", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(0);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/recommendations/count");
    expect(res.status).toBe(401);
  });
});

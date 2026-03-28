import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, createSession, getSessionWithUser } from "../db/repository";
import { requireAuth, optionalAuth } from "../middleware/auth";
import socialApp from "./social";
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
    const res = await app.request("/social/follow/nonexistent-id", {
      method: "POST",
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("User not found");
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

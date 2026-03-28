import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, createSession, getSessionWithUser, isFollowing } from "../db/repository";
import { getRawDb } from "../db/bun-db";
import { requireAuth } from "../middleware/auth";
import invitationsApp from "./invitations";
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
  app.use("/invitations/*", requireAuth);
  app.use("/invitations", requireAuth);
  app.route("/invitations", invitationsApp);
});

afterAll(() => {
  teardownTestDb();
});

function authHeaders(token: string) {
  return { Cookie: `better-auth.session_token=${token}` };
}

describe("POST /invitations", () => {
  it("generates an invitation", async () => {
    const res = await app.request("/invitations", {
      method: "POST",
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.code).toBeDefined();
    expect(body.expires_at).toBeDefined();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/invitations", { method: "POST" });
    expect(res.status).toBe(401);
  });
});

describe("GET /invitations", () => {
  it("lists user invitations", async () => {
    // Create two invitations
    await app.request("/invitations", {
      method: "POST",
      headers: authHeaders(userAToken),
    });
    await app.request("/invitations", {
      method: "POST",
      headers: authHeaders(userAToken),
    });

    const res = await app.request("/invitations", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invitations).toHaveLength(2);
    expect(body.invitations[0].id).toBeDefined();
    expect(body.invitations[0].code).toBeDefined();
    expect(body.invitations[0].created_at).toBeDefined();
    expect(body.invitations[0].expires_at).toBeDefined();
    expect(body.invitations[0].used_at).toBeNull();
    expect(body.invitations[0].used_by).toBeNull();
  });

  it("returns empty list when no invitations", async () => {
    const res = await app.request("/invitations", {
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.invitations).toHaveLength(0);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/invitations");
    expect(res.status).toBe(401);
  });
});

describe("POST /invitations/redeem/:code", () => {
  it("redeems an invitation and creates mutual follows", async () => {
    // Alice creates an invitation
    const createRes = await app.request("/invitations", {
      method: "POST",
      headers: authHeaders(userAToken),
    });
    const { code } = await createRes.json();

    // Bob redeems it
    const res = await app.request(`/invitations/redeem/${code}`, {
      method: "POST",
      headers: authHeaders(userBToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.inviter.id).toBe(userAId);
    expect(body.inviter.username).toBe("alice");

    // Verify mutual follows
    const aliceFollowsBob = await isFollowing(userAId, userBId);
    const bobFollowsAlice = await isFollowing(userBId, userAId);
    expect(aliceFollowsBob).toBe(true);
    expect(bobFollowsAlice).toBe(true);
  });

  it("returns 400 when redeeming own invitation", async () => {
    const createRes = await app.request("/invitations", {
      method: "POST",
      headers: authHeaders(userAToken),
    });
    const { code } = await createRes.json();

    const res = await app.request(`/invitations/redeem/${code}`, {
      method: "POST",
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("own invitation");
  });

  it("returns 410 when invitation is expired", async () => {
    const createRes = await app.request("/invitations", {
      method: "POST",
      headers: authHeaders(userAToken),
    });
    const { code } = await createRes.json();

    // Manually expire the invitation in the DB
    const db = getRawDb();
    db.prepare("UPDATE invitations SET expires_at = '2020-01-01T00:00:00.000Z' WHERE code = ?").run(code);

    const res = await app.request(`/invitations/redeem/${code}`, {
      method: "POST",
      headers: authHeaders(userBToken),
    });
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toContain("expired");
  });

  it("returns 409 when invitation is already used", async () => {
    const createRes = await app.request("/invitations", {
      method: "POST",
      headers: authHeaders(userAToken),
    });
    const { code } = await createRes.json();

    // Bob redeems it
    await app.request(`/invitations/redeem/${code}`, {
      method: "POST",
      headers: authHeaders(userBToken),
    });

    // Create another user to try redeeming the same code
    const userCId = await createUser("carol", "hash", "Carol");
    const userCToken = await createSession(userCId);

    const res = await app.request(`/invitations/redeem/${code}`, {
      method: "POST",
      headers: authHeaders(userCToken),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("already been used");
  });

  it("returns 404 when invitation code does not exist", async () => {
    const res = await app.request("/invitations/redeem/nonexistent-code", {
      method: "POST",
      headers: authHeaders(userBToken),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("not found");
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/invitations/redeem/some-code", {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /invitations/:id", () => {
  it("revokes own invitation", async () => {
    const createRes = await app.request("/invitations", {
      method: "POST",
      headers: authHeaders(userAToken),
    });
    const { id } = await createRes.json();

    const res = await app.request(`/invitations/${id}`, {
      method: "DELETE",
      headers: authHeaders(userAToken),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify it's gone
    const listRes = await app.request("/invitations", {
      headers: authHeaders(userAToken),
    });
    const listBody = await listRes.json();
    expect(listBody.invitations).toHaveLength(0);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/invitations/some-id", {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });
});

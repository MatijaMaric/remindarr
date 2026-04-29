import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, createSession, getSessionWithUser } from "../db/repository";
import { requireAuth } from "../middleware/auth";
import shareApp from "./share";
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
let userToken: string;
let userId: string;

beforeEach(async () => {
  setupTestDb();

  userId = await createUser("shareuser", "hash");
  userToken = await createSession(userId);

  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", createMockAuth() as any);
    await next();
  });
  app.use("/share/token*", requireAuth);
  app.route("/share", shareApp);
});

afterAll(() => {
  teardownTestDb();
});

function authHeaders() {
  return { Cookie: `better-auth.session_token=${userToken}` };
}

describe("GET /share/token (auth)", () => {
  it("returns 401 without session", async () => {
    const res = await app.request("/share/token");
    expect(res.status).toBe(401);
  });

  it("returns { token: null } before any token is generated", async () => {
    const res = await app.request("/share/token", { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.token).toBeNull();
  });

  it("returns token after generation", async () => {
    await app.request("/share/token", { method: "POST", headers: authHeaders() });
    const res = await app.request("/share/token", { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(0);
  });
});

describe("POST /share/token (auth)", () => {
  it("returns 401 without session", async () => {
    const res = await app.request("/share/token", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("returns a new token", async () => {
    const res = await app.request("/share/token", {
      method: "POST",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(0);
  });

  it("rotation replaces old token", async () => {
    const res1 = await app.request("/share/token", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token: t1 } = (await res1.json()) as { token: string };

    await app.request("/share/token", {
      method: "POST",
      headers: authHeaders(),
    });

    // Old token should no longer resolve a watchlist
    const watchlistRes = await app.request(`/share/watchlist/${t1}`);
    expect(watchlistRes.status).toBe(404);
  });
});

describe("DELETE /share/token (auth)", () => {
  it("returns 401 without session", async () => {
    const res = await app.request("/share/token", { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("returns 200 on success", async () => {
    const res = await app.request("/share/token", {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
  });

  it("subsequent GET token returns null after revoke", async () => {
    await app.request("/share/token", { method: "POST", headers: authHeaders() });
    await app.request("/share/token", { method: "DELETE", headers: authHeaders() });
    const res = await app.request("/share/token", { headers: authHeaders() });
    const body = (await res.json()) as any;
    expect(body.token).toBeNull();
  });

  it("revoked token returns 404 on watchlist", async () => {
    const genRes = await app.request("/share/token", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await genRes.json()) as { token: string };

    await app.request("/share/token", { method: "DELETE", headers: authHeaders() });

    const watchlistRes = await app.request(`/share/watchlist/${token}`);
    expect(watchlistRes.status).toBe(404);
  });
});

describe("GET /share/watchlist/:token (public)", () => {
  it("returns 404 for unknown token", async () => {
    const res = await app.request("/share/watchlist/unknowntoken12345");
    expect(res.status).toBe(404);
  });

  it("returns 200 with username and empty titles array for valid token", async () => {
    const genRes = await app.request("/share/token", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await genRes.json()) as { token: string };

    const res = await app.request(`/share/watchlist/${token}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.username).toBe("shareuser");
    expect(Array.isArray(body.titles)).toBe(true);
  });
});

describe("validation", () => {
  it("unknown token returns 404", async () => {
    const res = await app.request("/share/watchlist/notarealtoken");
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error).toBeDefined();
  });
});

import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, createSession, getSessionWithUser } from "../db/repository";
import { requireAuth } from "../middleware/auth";
import kioskApp from "./kiosk";
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

  userId = await createUser("kioskuser", "hash");
  userToken = await createSession(userId);

  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", createMockAuth() as any);
    await next();
  });
  app.use("/kiosk/token*", requireAuth);
  app.route("/kiosk", kioskApp);
});

afterAll(() => {
  teardownTestDb();
});

function authHeaders() {
  return { Cookie: `better-auth.session_token=${userToken}` };
}

describe("GET /kiosk/:token (public dashboard)", () => {
  it("returns 401 for unknown token", async () => {
    const res = await app.request("/kiosk/not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("returns dashboard data for valid token", async () => {
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = await regenRes.json() as { token: string };

    const res = await app.request(`/kiosk/${token}`);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(Array.isArray(body.tonight)).toBe(true);
    expect(Array.isArray(body.week)).toBe(true);
    expect(Array.isArray(body.recent)).toBe(true);
    expect(Array.isArray(body.watching)).toBe(true);
  });

  it("sets Cache-Control: no-cache on dashboard response", async () => {
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = await regenRes.json() as { token: string };

    const res = await app.request(`/kiosk/${token}`);
    expect(res.headers.get("Cache-Control")).toContain("no-cache");
  });

  it("returns 401 after token is revoked", async () => {
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = await regenRes.json() as { token: string };

    await app.request("/kiosk/token", { method: "DELETE", headers: authHeaders() });

    const res = await app.request(`/kiosk/${token}`);
    expect(res.status).toBe(401);
  });

  it("returns 401 after token is regenerated (old token invalid)", async () => {
    const res1 = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token: oldToken } = await res1.json() as { token: string };

    await app.request("/kiosk/token/regenerate", { method: "POST", headers: authHeaders() });

    const res = await app.request(`/kiosk/${oldToken}`);
    expect(res.status).toBe(401);
  });
});

describe("validation", () => {
  it("returns 400 for token that exceeds max length", async () => {
    const longToken = "a".repeat(65);
    const res = await app.request(`/kiosk/${longToken}`);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(Array.isArray(body.issues)).toBe(true);
  });
});

describe("GET /kiosk/token", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/kiosk/token");
    expect(res.status).toBe(401);
  });

  it("returns null token before any generation", async () => {
    const res = await app.request("/kiosk/token", { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { token: string | null };
    expect(body.token).toBeNull();
  });

  it("returns token after regeneration", async () => {
    await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const res = await app.request("/kiosk/token", { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json() as { token: string };
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(0);
  });
});

describe("POST /kiosk/token/regenerate", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/kiosk/token/regenerate", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("generates a 32-char hex token", async () => {
    const res = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { token: string };
    expect(typeof body.token).toBe("string");
    expect(body.token).toMatch(/^[0-9a-f]{32}$/);
  });

  it("new token replaces the old one", async () => {
    const res1 = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token: token1 } = await res1.json() as { token: string };

    const res2 = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token: token2 } = await res2.json() as { token: string };

    expect(token1).not.toBe(token2);

    const getRes = await app.request("/kiosk/token", { headers: authHeaders() });
    const { token: storedToken } = await getRes.json() as { token: string };
    expect(storedToken).toBe(token2);
  });
});

describe("DELETE /kiosk/token", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request("/kiosk/token", { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("returns 204 and clears the token", async () => {
    await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });

    const deleteRes = await app.request("/kiosk/token", {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(deleteRes.status).toBe(204);

    const getRes = await app.request("/kiosk/token", { headers: authHeaders() });
    const body = await getRes.json() as { token: string | null };
    expect(body.token).toBeNull();
  });
});

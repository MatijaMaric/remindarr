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

  it("returns dashboard data with new shape for valid token", async () => {
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await regenRes.json()) as { token: string };

    const res = await app.request(`/kiosk/${token}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.meta).toBeDefined();
    expect(typeof body.meta.household).toBe("string");
    expect(typeof body.meta.fidelity).toBe("string");
    expect(typeof body.meta.refresh_interval_seconds).toBe("number");
    expect(typeof body.meta.generated_at).toBe("string");
    expect(Array.isArray(body.releasing_today)).toBe(true);
    expect(Array.isArray(body.unwatched_queue)).toBe(true);
    // airing_now is null when no episodes exist in test db
    expect(body.airing_now).toBeNull();
  });

  it("sets Cache-Control: no-cache, no-store", async () => {
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await regenRes.json()) as { token: string };

    const res = await app.request(`/kiosk/${token}`);
    expect(res.headers.get("Cache-Control")).toBe("no-cache, no-store");
  });

  it("returns 300 refresh_interval_seconds for rich fidelity", async () => {
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await regenRes.json()) as { token: string };

    const res = await app.request(`/kiosk/${token}?display=rich`);
    const body = (await res.json()) as any;
    expect(body.meta.refresh_interval_seconds).toBe(300);
    expect(body.meta.fidelity).toBe("rich");
  });

  it("returns 1800 refresh_interval_seconds for epaper fidelity", async () => {
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await regenRes.json()) as { token: string };

    const res = await app.request(`/kiosk/${token}?display=epaper`);
    const body = (await res.json()) as any;
    expect(body.meta.refresh_interval_seconds).toBe(1800);
    expect(body.meta.fidelity).toBe("epaper");
  });

  it("returns 300 refresh_interval_seconds for lite fidelity", async () => {
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await regenRes.json()) as { token: string };

    const res = await app.request(`/kiosk/${token}?display=lite`);
    const body = (await res.json()) as any;
    expect(body.meta.refresh_interval_seconds).toBe(300);
    expect(body.meta.fidelity).toBe("lite");
  });

  it("returns 400 for invalid display query param", async () => {
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await regenRes.json()) as { token: string };

    const res = await app.request(`/kiosk/${token}?display=invalid`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 for token longer than 64 chars", async () => {
    const res = await app.request(`/kiosk/${"x".repeat(65)}`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("defaults to rich fidelity when display param is absent", async () => {
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await regenRes.json()) as { token: string };

    const res = await app.request(`/kiosk/${token}`);
    const body = (await res.json()) as any;
    expect(body.meta.fidelity).toBe("rich");
    expect(body.meta.refresh_interval_seconds).toBe(300);
  });
});

describe("validation", () => {
  it("returns 400 with issues array for invalid display param", async () => {
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await regenRes.json()) as { token: string };

    const res = await app.request(`/kiosk/${token}?display=hd`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });
});

describe("GET /api/kiosk/token (auth)", () => {
  it("returns 401 without session", async () => {
    const res = await app.request("/kiosk/token");
    expect(res.status).toBe(401);
  });

  it("returns { token: null } before any token is generated", async () => {
    const res = await app.request("/kiosk/token", { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.token).toBeNull();
  });
});

describe("POST /api/kiosk/token/regenerate (auth)", () => {
  it("returns a new token", async () => {
    const res = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(0);
  });

  it("a second regenerate invalidates the first token", async () => {
    const res1 = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token: t1 } = (await res1.json()) as { token: string };

    await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });

    const dashRes = await app.request(`/kiosk/${t1}`);
    expect(dashRes.status).toBe(401);
  });
});

describe("DELETE /api/kiosk/token (auth)", () => {
  it("returns 401 without session", async () => {
    const res = await app.request("/kiosk/token", { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("revokes the token — subsequent dashboard requests return 401", async () => {
    const regenRes = await app.request("/kiosk/token/regenerate", {
      method: "POST",
      headers: authHeaders(),
    });
    const { token } = (await regenRes.json()) as { token: string };

    await app.request("/kiosk/token", { method: "DELETE", headers: authHeaders() });

    const dashRes = await app.request(`/kiosk/${token}`);
    expect(dashRes.status).toBe(401);
  });

  it("returns 204", async () => {
    const res = await app.request("/kiosk/token", {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(204);
  });
});

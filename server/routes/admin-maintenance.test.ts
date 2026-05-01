import { describe, it, expect, beforeEach, afterAll, mock, spyOn, afterEach } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, createSession, getSessionWithUser } from "../db/repository";
import { requireAuth, requireAdmin } from "../middleware/auth";
import maintenanceApp from "./admin-maintenance";
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
let adminCookie: string;

beforeEach(async () => {
  setupTestDb();
  const hash = await Bun.password.hash("admin123");
  const adminId = await createUser("admin", hash, "Admin", "local", undefined, true);
  const token = await createSession(adminId);
  adminCookie = `better-auth.session_token=${token}`;

  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", createMockAuth() as any);
    await next();
  });
  app.use("/maintenance/*", requireAuth, requireAdmin);
  app.route("/maintenance", maintenanceApp);
});

afterAll(() => {
  teardownTestDb();
});

describe("POST /maintenance/flush-cache", () => {
  it("flushes cache and returns flushed: true", async () => {
    const res = await app.request("/maintenance/flush-cache", {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.flushed).toBe(true);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/maintenance/flush-cache", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    const userId = await createUser("regular", "hash");
    const token = await createSession(userId);
    const res = await app.request("/maintenance/flush-cache", {
      method: "POST",
      headers: { Cookie: `better-auth.session_token=${token}` },
    });
    expect(res.status).toBe(403);
  });
});

describe("POST /maintenance/run-jobs", () => {
  it("returns queued array", async () => {
    const res = await app.request("/maintenance/run-jobs", {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.queued)).toBe(true);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/maintenance/run-jobs", { method: "POST" });
    expect(res.status).toBe(401);
  });
});

describe("POST /maintenance/backup", () => {
  it("returns queued: true", async () => {
    const res = await app.request("/maintenance/backup", {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.queued).toBe(true);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/maintenance/backup", { method: "POST" });
    expect(res.status).toBe(401);
  });
});

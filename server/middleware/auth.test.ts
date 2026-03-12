import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, createSession } from "../db/repository";
import { optionalAuth, requireAuth, requireAdmin } from "./auth";
import { CONFIG } from "../config";
import type { AppEnv } from "../types";

let app: Hono<AppEnv>;
let validToken: string;
let adminToken: string;

beforeEach(() => {
  setupTestDb();

  const userId = createUser("testuser", "hash", "Test User");
  validToken = createSession(userId);

  const adminId = createUser("admin", "hash", "Admin", "local", undefined, true);
  adminToken = createSession(adminId);

  app = new Hono<AppEnv>();

  app.use("/optional/*", optionalAuth);
  app.get("/optional/test", (c) => {
    const user = c.get("user");
    return c.json({ user: user ?? null });
  });

  app.use("/protected/*", requireAuth);
  app.get("/protected/test", (c) => {
    return c.json({ user: c.get("user") });
  });

  app.use("/admin/*", requireAuth, requireAdmin);
  app.get("/admin/test", (c) => {
    return c.json({ ok: true });
  });
});

afterAll(() => {
  teardownTestDb();
});

describe("optionalAuth", () => {
  it("sets user when valid cookie present", async () => {
    const res = await app.request("/optional/test", {
      headers: { Cookie: `${CONFIG.SESSION_COOKIE_NAME}=${validToken}` },
    });
    const body = await res.json();
    expect(body.user).not.toBeNull();
    expect(body.user.username).toBe("testuser");
  });

  it("passes through without cookie", async () => {
    const res = await app.request("/optional/test");
    const body = await res.json();
    expect(body.user).toBeNull();
  });

  it("passes through with invalid cookie", async () => {
    const res = await app.request("/optional/test", {
      headers: { Cookie: `${CONFIG.SESSION_COOKIE_NAME}=invalid` },
    });
    const body = await res.json();
    expect(body.user).toBeNull();
  });
});

describe("requireAuth", () => {
  it("allows request with valid session", async () => {
    const res = await app.request("/protected/test", {
      headers: { Cookie: `${CONFIG.SESSION_COOKIE_NAME}=${validToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.username).toBe("testuser");
  });

  it("returns 401 without cookie", async () => {
    const res = await app.request("/protected/test");
    expect(res.status).toBe(401);
  });

  it("returns 401 with invalid cookie", async () => {
    const res = await app.request("/protected/test", {
      headers: { Cookie: `${CONFIG.SESSION_COOKIE_NAME}=invalid` },
    });
    expect(res.status).toBe(401);
  });
});

describe("requireAdmin", () => {
  it("allows admin users", async () => {
    const res = await app.request("/admin/test", {
      headers: { Cookie: `${CONFIG.SESSION_COOKIE_NAME}=${adminToken}` },
    });
    expect(res.status).toBe(200);
  });

  it("returns 403 for non-admin users", async () => {
    const res = await app.request("/admin/test", {
      headers: { Cookie: `${CONFIG.SESSION_COOKIE_NAME}=${validToken}` },
    });
    expect(res.status).toBe(403);
  });
});

import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import {
  createUser,
  createSession,
  getSetting,
  setSetting,
} from "../db/repository";
import { requireAuth, requireAdmin } from "../middleware/auth";
import { CONFIG } from "../config";
import adminApp from "./admin";
import type { AppEnv } from "../types";

let app: Hono<AppEnv>;
let adminCookie: string;

beforeEach(async () => {
  setupTestDb();

  // Create admin user
  const hash = await Bun.password.hash("admin123");
  const adminId = createUser("admin", hash, "Admin", "local", undefined, true);
  const token = createSession(adminId);
  adminCookie = `${CONFIG.SESSION_COOKIE_NAME}=${token}`;

  app = new Hono<AppEnv>();
  app.use("/admin/*", requireAuth);
  app.use("/admin/*", requireAdmin);
  app.route("/admin", adminApp);
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /admin/settings", () => {
  it("returns OIDC settings for admin", async () => {
    const res = await app.request("/admin/settings", {
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.oidc).toBeDefined();
    expect(body.oidc.issuer_url).toBeDefined();
    expect(body.oidc.client_id).toBeDefined();
    expect(body.oidc.client_secret).toBeDefined();
    expect(body.oidc.redirect_uri).toBeDefined();
    expect(body.oidc_configured).toBeDefined();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/admin/settings");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin user", async () => {
    const userId = createUser("regular", "hash");
    const token = createSession(userId);
    const userCookie = `${CONFIG.SESSION_COOKIE_NAME}=${token}`;

    const res = await app.request("/admin/settings", {
      headers: { Cookie: userCookie },
    });
    expect(res.status).toBe(403);
  });

  it("reflects DB-stored OIDC values", async () => {
    setSetting("oidc_issuer_url", "https://auth.example.com");
    setSetting("oidc_client_id", "my-client");

    const res = await app.request("/admin/settings", {
      headers: { Cookie: adminCookie },
    });
    const body = await res.json();
    expect(body.oidc.issuer_url.value).toBe("https://auth.example.com");
    expect(body.oidc.client_id.value).toBe("my-client");
  });
});

describe("PUT /admin/settings", () => {
  it("saves OIDC settings", async () => {
    const res = await app.request("/admin/settings", {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        oidc_issuer_url: "https://auth.example.com",
        oidc_client_id: "test-client",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify settings persisted
    expect(getSetting("oidc_issuer_url")).toBe("https://auth.example.com");
    expect(getSetting("oidc_client_id")).toBe("test-client");
  });

  it("deletes settings when value is empty string", async () => {
    setSetting("oidc_issuer_url", "https://auth.example.com");

    const res = await app.request("/admin/settings", {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ oidc_issuer_url: "" }),
    });
    expect(res.status).toBe(200);
    expect(getSetting("oidc_issuer_url")).toBeNull();
  });

  it("deletes settings when value is null", async () => {
    setSetting("oidc_client_id", "old-client");

    const res = await app.request("/admin/settings", {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ oidc_client_id: null }),
    });
    expect(res.status).toBe(200);
    expect(getSetting("oidc_client_id")).toBeNull();
  });

  it("ignores unknown keys", async () => {
    const res = await app.request("/admin/settings", {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ unknown_key: "value", oidc_issuer_url: "https://auth.example.com" }),
    });
    expect(res.status).toBe(200);
    expect(getSetting("unknown_key")).toBeNull();
    expect(getSetting("oidc_issuer_url")).toBe("https://auth.example.com");
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/admin/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oidc_issuer_url: "https://auth.example.com" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin user", async () => {
    const userId = createUser("regular", "hash");
    const token = createSession(userId);
    const userCookie = `${CONFIG.SESSION_COOKIE_NAME}=${token}`;

    const res = await app.request("/admin/settings", {
      method: "PUT",
      headers: { Cookie: userCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ oidc_issuer_url: "https://auth.example.com" }),
    });
    expect(res.status).toBe(403);
  });

  it("handles invalid JSON gracefully", async () => {
    const res = await app.request("/admin/settings", {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});

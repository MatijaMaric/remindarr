import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import {
  createUser,
  createSession,
  getSessionWithUser,
  getSetting,
  setSetting,
  getUserById,
} from "../db/repository";
import { requireAuth, requireAdmin } from "../middleware/auth";
import adminApp, { setOnOidcSettingsChanged } from "./admin";
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

  // Create admin user
  const hash = await Bun.password.hash("admin123");
  const adminId = await createUser("admin", hash, "Admin", "local", undefined, true);
  const token = await createSession(adminId);
  adminCookie = `better-auth.session_token=${token}`;

  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", createMockAuth() as any);
    await next();
  });
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
    const userId = await createUser("regular", "hash");
    const token = await createSession(userId);
    const userCookie = `better-auth.session_token=${token}`;

    const res = await app.request("/admin/settings", {
      headers: { Cookie: userCookie },
    });
    expect(res.status).toBe(403);
  });

  it("reflects DB-stored OIDC values", async () => {
    await setSetting("oidc_issuer_url", "https://auth.example.com");
    await setSetting("oidc_client_id", "my-client");

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
    expect(body.oidc_configured).toBeDefined();

    // Verify settings persisted
    expect(await getSetting("oidc_issuer_url")).toBe("https://auth.example.com");
    expect(await getSetting("oidc_client_id")).toBe("test-client");
  });

  it("deletes settings when value is empty string", async () => {
    await setSetting("oidc_issuer_url", "https://auth.example.com");

    const res = await app.request("/admin/settings", {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ oidc_issuer_url: "" }),
    });
    expect(res.status).toBe(200);
    expect(await getSetting("oidc_issuer_url")).toBeNull();
  });

  it("deletes settings when value is null", async () => {
    await setSetting("oidc_client_id", "old-client");

    const res = await app.request("/admin/settings", {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ oidc_client_id: null }),
    });
    expect(res.status).toBe(200);
    expect(await getSetting("oidc_client_id")).toBeNull();
  });

  it("ignores unknown keys", async () => {
    const res = await app.request("/admin/settings", {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ unknown_key: "value", oidc_issuer_url: "https://auth.example.com" }),
    });
    expect(res.status).toBe(200);
    expect(await getSetting("unknown_key")).toBeNull();
    expect(await getSetting("oidc_issuer_url")).toBe("https://auth.example.com");
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
    const userId = await createUser("regular", "hash");
    const token = await createSession(userId);
    const userCookie = `better-auth.session_token=${token}`;

    const res = await app.request("/admin/settings", {
      method: "PUT",
      headers: { Cookie: userCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ oidc_issuer_url: "https://auth.example.com" }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects invalid JSON body", async () => {
    const res = await app.request("/admin/settings", {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });
});

// ─── User management tests ────────────────────────────────────────────────────

describe("GET /admin/users", () => {
  it("returns user list for admin", async () => {
    await createUser("alice", "hash");
    await createUser("bob", "hash");
    const res = await app.request("/admin/users", {
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.users)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(3); // admin + alice + bob
    expect(body.page).toBe(1);
    expect(body.page_size).toBe(50);
  });

  it("filters by search query", async () => {
    await createUser("searchable_user", "hash");
    const res = await app.request("/admin/users?search=searchable", {
      headers: { Cookie: adminCookie },
    });
    const body = await res.json();
    expect(body.users.some((u: { username: string }) => u.username === "searchable_user")).toBe(true);
  });

  it("filters banned users", async () => {
    const userId = await createUser("tobebanned", "hash");
    await app.request(`/admin/users/${userId}/ban`, {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "test ban" }),
    });
    const res = await app.request("/admin/users?filter=banned", {
      headers: { Cookie: adminCookie },
    });
    const body = await res.json();
    expect(body.users.some((u: { username: string }) => u.username === "tobebanned")).toBe(true);
  });

  it("returns 403 for non-admin", async () => {
    const userId = await createUser("regular", "hash");
    const token = await createSession(userId);
    const res = await app.request("/admin/users", {
      headers: { Cookie: `better-auth.session_token=${token}` },
    });
    expect(res.status).toBe(403);
  });
});

describe("GET /admin/users/:id", () => {
  it("returns user details with tracked count", async () => {
    const userId = await createUser("detailuser", "hash");
    const res = await app.request(`/admin/users/${userId}`, {
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.username).toBe("detailuser");
    expect(typeof body.user.tracked_count).toBe("number");
  });

  it("returns 404 for non-existent user", async () => {
    const res = await app.request("/admin/users/nonexistent-id", {
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(404);
  });
});

describe("validation", () => {
  it("rejects PUT /settings when OIDC value is a non-string", async () => {
    const res = await app.request("/admin/settings", {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ oidc_issuer_url: 123 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects PUT /users/:id/role with invalid enum", async () => {
    const userId = await createUser("zodcheck", "hash");
    const res = await app.request(`/admin/users/${userId}/role`, {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "superadmin" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects PUT /users/:id/role without role field", async () => {
    const userId = await createUser("zodcheck2", "hash");
    const res = await app.request(`/admin/users/${userId}/role`, {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects PUT /users/:id/ban with non-string reason", async () => {
    const userId = await createUser("banzodcheck", "hash");
    const res = await app.request(`/admin/users/${userId}/ban`, {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: 12345 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });
});

describe("PUT /admin/users/:id/role", () => {
  it("promotes a user to admin", async () => {
    const userId = await createUser("toPromote", "hash");
    const res = await app.request(`/admin/users/${userId}/role`, {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });
    expect(res.status).toBe(200);
    const user = await getUserById(userId);
    expect(user?.role).toBe("admin");
  });

  it("demotes admin to user", async () => {
    const userId = await createUser("toDemote", "hash", undefined, "local", undefined, true);
    const res = await app.request(`/admin/users/${userId}/role`, {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "user" }),
    });
    expect(res.status).toBe(200);
    const user = await getUserById(userId);
    expect(user?.role).toBe("user");
  });

  it("returns 400 for invalid role", async () => {
    const userId = await createUser("roletest", "hash");
    const res = await app.request(`/admin/users/${userId}/role`, {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "superuser" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when trying to change own role", async () => {
    // Get admin's userId from the session
    const sessionUser = await getSessionWithUser(adminCookie.split("=")[1]);
    const res = await app.request(`/admin/users/${sessionUser!.id}/role`, {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ role: "user" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("PUT /admin/users/:id/ban and /unban", () => {
  it("bans a user with a reason", async () => {
    const userId = await createUser("tobanned", "hash");
    const res = await app.request(`/admin/users/${userId}/ban`, {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "spam" }),
    });
    expect(res.status).toBe(200);
    const user = await getUserById(userId);
    expect(user).not.toBeNull();
  });

  it("unbans a user", async () => {
    const userId = await createUser("bannedUser", "hash");
    await app.request(`/admin/users/${userId}/ban`, {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await app.request(`/admin/users/${userId}/unban`, {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
  });

  it("returns 400 when trying to ban yourself", async () => {
    const sessionUser = await getSessionWithUser(adminCookie.split("=")[1]);
    const res = await app.request(`/admin/users/${sessionUser!.id}/ban`, {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /admin/users/:id", () => {
  it("deletes a user", async () => {
    const userId = await createUser("todelete", "hash");
    const res = await app.request(`/admin/users/${userId}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(200);
    const user = await getUserById(userId);
    expect(user).toBeNull();
  });

  it("returns 404 for non-existent user", async () => {
    const res = await app.request("/admin/users/nonexistent", {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when trying to delete yourself", async () => {
    const sessionUser = await getSessionWithUser(adminCookie.split("=")[1]);
    const res = await app.request(`/admin/users/${sessionUser!.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /admin/config", () => {
  it("returns safe and secrets arrays for admin", async () => {
    const res = await app.request("/admin/config", {
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.safe)).toBe(true);
    expect(Array.isArray(body.secrets)).toBe(true);
    // Safe entries have key, value, source fields
    expect(body.safe.every((e: { key: string; value: unknown; source: string }) => e.key && "value" in e && e.source)).toBe(true);
    // Secret entries have key and source, but NO value
    for (const entry of body.secrets as { key: string; source: string; value?: unknown }[]) {
      expect("value" in entry).toBe(false);
      expect(entry.source === "env" || entry.source === "unset").toBe(true);
    }
  });

  it("includes LOG_LEVEL in safe entries", async () => {
    const res = await app.request("/admin/config", {
      headers: { Cookie: adminCookie },
    });
    const body = await res.json();
    const logLevel = body.safe.find((e: { key: string }) => e.key === "LOG_LEVEL");
    expect(logLevel).toBeDefined();
    expect(logLevel.value).toBe("info");
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/admin/config");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    const userId = await createUser("regular2", "hash");
    const token = await createSession(userId);
    const res = await app.request("/admin/config", {
      headers: { Cookie: `better-auth.session_token=${token}` },
    });
    expect(res.status).toBe(403);
  });
});

describe("GET /admin/logs", () => {
  it("returns entries and count for admin", async () => {
    const res = await app.request("/admin/logs", {
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.entries)).toBe(true);
    expect(typeof body.count).toBe("number");
    expect(body.count).toBe(body.entries.length);
  });

  it("respects limit query param", async () => {
    const res = await app.request("/admin/logs?limit=5", {
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries.length).toBeLessThanOrEqual(5);
  });

  it("rejects invalid limit", async () => {
    const res = await app.request("/admin/logs?limit=0", {
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/admin/logs");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    const userId = await createUser("regular3", "hash");
    const token = await createSession(userId);
    const res = await app.request("/admin/logs", {
      headers: { Cookie: `better-auth.session_token=${token}` },
    });
    expect(res.status).toBe(403);
  });
});

describe("PUT /admin/settings — OIDC reload callback error handling", () => {
  it("returns 500 with oidc_reload_failed when the callback throws", async () => {
    setOnOidcSettingsChanged(async () => {
      throw new Error("discovery doc unreachable");
    });

    const res = await app.request("/admin/settings", {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ oidc_issuer_url: "https://auth.example.com" }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("oidc_reload_failed");
    expect(typeof body.message).toBe("string");
    expect(body.message).toContain("discovery doc unreachable");

    // Settings must still have been persisted despite the reload failure
    expect(await getSetting("oidc_issuer_url")).toBe("https://auth.example.com");
  });

  it("returns 200 when callback succeeds", async () => {
    let called = false;
    setOnOidcSettingsChanged(async () => { called = true; });

    const res = await app.request("/admin/settings", {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ oidc_issuer_url: "https://auth.example.com" }),
    });

    expect(res.status).toBe(200);
    expect(called).toBe(true);
  });
});

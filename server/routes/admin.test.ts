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
import adminApp from "./admin";
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

  it("handles invalid JSON gracefully", async () => {
    const res = await app.request("/admin/settings", {
      method: "PUT",
      headers: { Cookie: adminCookie, "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.oidc_configured).toBeDefined();
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

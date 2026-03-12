import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, getUserByUsername } from "../db/repository";
import { CONFIG } from "../config";
import authApp, { checkAdminClaim } from "./auth";
import type { AppEnv } from "../types";

let app: Hono<AppEnv>;

beforeEach(async () => {
  setupTestDb();
  app = new Hono<AppEnv>();
  app.route("/auth", authApp);

  // Create a test user with a hashed password
  const hash = await Bun.password.hash("password123");
  createUser("testuser", hash, "Test User");
});

afterAll(() => {
  teardownTestDb();
});

describe("POST /auth/login", () => {
  it("logs in with valid credentials", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: "password123" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.username).toBe("testuser");
    expect(res.headers.get("set-cookie")).toContain(CONFIG.SESSION_COOKIE_NAME);
  });

  it("returns 401 for wrong password", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: "wrong" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 401 for non-existent user", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "nobody", password: "password" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for missing fields", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /auth/me", () => {
  it("returns user when logged in", async () => {
    // Login first
    const loginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: "password123" }),
    });
    const cookie = loginRes.headers.get("set-cookie")!;

    const res = await app.request("/auth/me", {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.username).toBe("testuser");
  });

  it("returns null user without session", async () => {
    const res = await app.request("/auth/me");
    const body = await res.json();
    expect(body.user).toBeNull();
  });
});

describe("POST /auth/logout", () => {
  it("clears session", async () => {
    // Login first
    const loginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: "password123" }),
    });
    const cookie = loginRes.headers.get("set-cookie")!;

    // Logout
    const res = await app.request("/auth/logout", {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);

    // Verify session is gone
    const meRes = await app.request("/auth/me", {
      headers: { Cookie: cookie },
    });
    const meBody = await meRes.json();
    expect(meBody.user).toBeNull();
  });
});

describe("POST /auth/change-password", () => {
  it("changes password successfully", async () => {
    const loginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: "password123" }),
    });
    const cookie = loginRes.headers.get("set-cookie")!;

    const res = await app.request("/auth/change-password", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "password123", newPassword: "newpass456" }),
    });
    expect(res.status).toBe(200);

    // Verify new password works
    const newLoginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: "newpass456" }),
    });
    expect(newLoginRes.status).toBe(200);
  });

  it("returns 400 for short password", async () => {
    const loginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: "password123" }),
    });
    const cookie = loginRes.headers.get("set-cookie")!;

    const res = await app.request("/auth/change-password", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "password123", newPassword: "short" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 for wrong current password", async () => {
    const loginRes = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: "password123" }),
    });
    const cookie = loginRes.headers.get("set-cookie")!;

    const res = await app.request("/auth/change-password", {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "wrong", newPassword: "newpass456" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /auth/providers", () => {
  it("returns available providers", async () => {
    const res = await app.request("/auth/providers");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.local).toBe(true);
  });
});

describe("checkAdminClaim", () => {
  it("returns true when array claim contains the admin value", () => {
    const claims = { groups: ["admin", "users", "editors"] };
    expect(checkAdminClaim(claims, "groups", "admin")).toBe(true);
  });

  it("returns false when array claim does not contain the admin value", () => {
    const claims = { groups: ["users", "editors"] };
    expect(checkAdminClaim(claims, "groups", "admin")).toBe(false);
  });

  it("returns true when string claim matches the admin value", () => {
    const claims = { role: "admin" };
    expect(checkAdminClaim(claims, "role", "admin")).toBe(true);
  });

  it("returns false when string claim does not match", () => {
    const claims = { role: "user" };
    expect(checkAdminClaim(claims, "role", "admin")).toBe(false);
  });

  it("returns false when claim is missing from claims", () => {
    const claims = { email: "test@example.com" };
    expect(checkAdminClaim(claims, "groups", "admin")).toBe(false);
  });

  it("returns false when claimName is empty", () => {
    const claims = { groups: ["admin"] };
    expect(checkAdminClaim(claims, "", "admin")).toBe(false);
  });

  it("returns false when claimValue is empty", () => {
    const claims = { groups: ["admin"] };
    expect(checkAdminClaim(claims, "groups", "")).toBe(false);
  });

  it("is case-sensitive for string comparison", () => {
    const claims = { groups: ["Admin"] };
    expect(checkAdminClaim(claims, "groups", "admin")).toBe(false);
    expect(checkAdminClaim(claims, "groups", "Admin")).toBe(true);
  });
});

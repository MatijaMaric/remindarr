import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser } from "../db/repository";
import userSettingsApp, { DEFAULT_HOMEPAGE_LAYOUT } from "./user-settings";
import type { AppEnv } from "../types";

let userId: string;

function makeAuthedApp() {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: userId, username: "testuser", name: null, role: null, is_admin: false });
    await next();
  });
  a.route("/user/settings", userSettingsApp);
  return a;
}

function jsonHeaders() {
  return { "Content-Type": "application/json" };
}

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("testuser", "hash");
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /user/settings/homepage-layout", () => {
  it("returns default layout for new user", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/homepage-layout");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.homepage_layout).toEqual(DEFAULT_HOMEPAGE_LAYOUT);
  });

  it("returns saved layout after update", async () => {
    const app = makeAuthedApp();
    const newLayout = [
      { id: "today", enabled: true },
      { id: "upcoming", enabled: false },
      { id: "unwatched", enabled: true },
      { id: "recommendations", enabled: true },
    ];
    await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ homepage_layout: newLayout }),
    });

    const res = await app.request("/user/settings/homepage-layout");
    const body = await res.json();
    expect(body.homepage_layout[0].id).toBe("today");
    expect(body.homepage_layout[1].enabled).toBe(false);
  });
});

describe("PUT /user/settings/homepage-layout", () => {
  it("saves a valid layout", async () => {
    const app = makeAuthedApp();
    const layout = [
      { id: "recommendations", enabled: false },
      { id: "today", enabled: true },
      { id: "unwatched", enabled: true },
      { id: "upcoming", enabled: true },
    ];
    const res = await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ homepage_layout: layout }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.homepage_layout[0].id).toBe("recommendations");
    expect(body.homepage_layout[0].enabled).toBe(false);
  });

  it("returns 400 for non-array payload", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ homepage_layout: "invalid" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for unknown section id", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ homepage_layout: [{ id: "unknown_section", enabled: true }] }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for duplicate section ids", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({
        homepage_layout: [
          { id: "today", enabled: true },
          { id: "today", enabled: false },
        ],
      }),
    });
    expect(res.status).toBe(400);
  });

  it("partial layout: missing sections are appended with defaults", async () => {
    const app = makeAuthedApp();
    // Save only 2 sections
    await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({
        homepage_layout: [
          { id: "today", enabled: true },
          { id: "unwatched", enabled: false },
        ],
      }),
    });

    const res = await app.request("/user/settings/homepage-layout");
    const body = await res.json();
    // All 4 sections returned; the 2 missing ones are appended
    expect(body.homepage_layout).toHaveLength(4);
    expect(body.homepage_layout[0].id).toBe("today");
    expect(body.homepage_layout[1].id).toBe("unwatched");
  });
});

describe("validation", () => {
  it("returns 400 + issues array for non-array payload", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ homepage_layout: "invalid" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 + issues array for unknown section id", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({ homepage_layout: [{ id: "garbage", enabled: true }] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 + issues array for duplicate section ids", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({
        homepage_layout: [
          { id: "today", enabled: true },
          { id: "today", enabled: false },
        ],
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 + issues array when homepage_layout is missing", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 + issues array when enabled is not a boolean", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/user/settings/homepage-layout", {
      method: "PUT",
      headers: jsonHeaders(),
      body: JSON.stringify({
        homepage_layout: [{ id: "today", enabled: "yes" }],
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });
});

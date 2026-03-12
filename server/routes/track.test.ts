import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import { upsertTitles, createUser, createSession } from "../db/repository";
import { requireAuth } from "../middleware/auth";
import { CONFIG } from "../config";
import trackApp from "./track";
import type { AppEnv } from "../types";

let app: Hono<AppEnv>;
let userToken: string;

beforeEach(() => {
  setupTestDb();

  const userId = createUser("trackuser", "hash");
  userToken = createSession(userId);

  app = new Hono<AppEnv>();
  app.use("/track/*", requireAuth);
  app.route("/track", trackApp);
});

afterAll(() => {
  teardownTestDb();
});

function headers() {
  return { Cookie: `${CONFIG.SESSION_COOKIE_NAME}=${userToken}` };
}

describe("GET /track", () => {
  it("returns empty tracked list", async () => {
    const res = await app.request("/track", { headers: headers() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.titles).toHaveLength(0);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/track");
    expect(res.status).toBe(401);
  });
});

describe("POST /track/:id", () => {
  it("tracks a title", async () => {
    upsertTitles([makeParsedTitle()]);

    const res = await app.request("/track/movie-123", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Verify it's tracked
    const listRes = await app.request("/track", { headers: headers() });
    const listBody = await listRes.json();
    expect(listBody.titles).toHaveLength(1);
  });
});

describe("DELETE /track/:id", () => {
  it("untracks a title", async () => {
    upsertTitles([makeParsedTitle()]);

    // Track first
    await app.request("/track/movie-123", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    // Untrack
    const res = await app.request("/track/movie-123", {
      method: "DELETE",
      headers: headers(),
    });
    expect(res.status).toBe(200);

    // Verify untracked
    const listRes = await app.request("/track", { headers: headers() });
    const listBody = await listRes.json();
    expect(listBody.titles).toHaveLength(0);
  });
});

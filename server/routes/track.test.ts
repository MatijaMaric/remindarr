import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import { upsertTitles, createUser, createSession, getSessionWithUser } from "../db/repository";
import { requireAuth } from "../middleware/auth";
import trackApp from "./track";
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

beforeEach(async () => {
  setupTestDb();

  const userId = await createUser("trackuser", "hash");
  userToken = await createSession(userId);

  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", createMockAuth() as any);
    await next();
  });
  app.use("/track/*", requireAuth);
  app.route("/track", trackApp);
});

afterAll(() => {
  teardownTestDb();
});

function headers() {
  return { Cookie: `better-auth.session_token=${userToken}` };
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
    await upsertTitles([makeParsedTitle()]);

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
    await upsertTitles([makeParsedTitle()]);

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

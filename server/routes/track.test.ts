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
    expect(body.message).toContain("Tracking");

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

describe("GET /track/export", () => {
  it("returns empty export when nothing tracked", async () => {
    const res = await app.request("/track/export", { headers: headers() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.version).toBe(1);
    expect(body.titles).toHaveLength(0);
    expect(body.exported_at).toBeTruthy();
  });

  it("returns tracked titles in export", async () => {
    await upsertTitles([makeParsedTitle()]);
    await app.request("/track/movie-123", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await app.request("/track/export", { headers: headers() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.titles).toHaveLength(1);
    expect(body.titles[0].id).toBe("movie-123");
    expect(body.titles[0].tmdb_id).toBe("123");
    expect(body.titles[0].title).toBe("Test Movie");
    expect(body.titles[0].watched_episodes).toEqual([]);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/track/export");
    expect(res.status).toBe(401);
  });
});

describe("POST /track/import", () => {
  it("imports titles from export data", async () => {
    const exportData = {
      version: 1,
      exported_at: "2026-01-01T00:00:00Z",
      titles: [
        {
          id: "movie-123",
          tmdb_id: "123",
          object_type: "MOVIE",
          title: "Test Movie",
          original_title: null,
          release_year: 2024,
          release_date: "2024-06-15",
          runtime_minutes: 120,
          short_description: "A test movie",
          genres: ["Action"],
          original_language: "en",
          imdb_id: "tt1234567",
          poster_url: null,
          age_certification: null,
          tmdb_url: null,
          tracked_at: "2026-01-01T00:00:00Z",
          notes: null,
          watched_episodes: [],
        },
      ],
    };

    const res = await app.request("/track/import", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify(exportData),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.imported).toBe(1);
    expect(body.skipped).toBe(0);

    // Verify tracked
    const listRes = await app.request("/track", { headers: headers() });
    const listBody = await listRes.json();
    expect(listBody.titles).toHaveLength(1);
    expect(listBody.titles[0].id).toBe("movie-123");
  });

  it("skips items with missing required fields", async () => {
    const exportData = {
      version: 1,
      exported_at: "2026-01-01T00:00:00Z",
      titles: [
        { id: "movie-123" }, // missing title and object_type
        {
          id: "movie-456",
          tmdb_id: "456",
          object_type: "MOVIE",
          title: "Another Movie",
          genres: [],
          watched_episodes: [],
        },
      ],
    };

    const res = await app.request("/track/import", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify(exportData),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.imported).toBe(1);
    expect(body.skipped).toBe(1);
  });

  it("returns 400 for invalid JSON structure", async () => {
    const res = await app.request("/track/import", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ invalid: true }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/track/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titles: [] }),
    });
    expect(res.status).toBe(401);
  });
});

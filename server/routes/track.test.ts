import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import { upsertTitles, createUser, createSession, getSessionWithUser } from "../db/repository";
import { requireAuth } from "../middleware/auth";
import { getRawDb } from "../db/bun-db";
import { CONFIG } from "../config";
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

  it("enqueues sync-show-episodes job when tracking a SHOW with tmdb_id", async () => {
    const showTitle = makeParsedTitle({ id: "tv-456", objectType: "SHOW", tmdbId: "456", title: "Test Show" });
    await upsertTitles([showTitle]);

    const originalKey = CONFIG.TMDB_API_KEY;
    CONFIG.TMDB_API_KEY = "test-key";

    const titleData = {
      id: "tv-456",
      object_type: "SHOW",
      tmdb_id: "456",
      title: "Test Show",
    };

    const res = await app.request("/track/tv-456", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ titleData }),
    });
    expect(res.status).toBe(200);

    const db = getRawDb();
    const job = db.prepare("SELECT * FROM jobs WHERE name = 'sync-show-episodes' LIMIT 1").get() as any;
    expect(job).toBeTruthy();
    expect(JSON.parse(job.data)).toMatchObject({ titleId: "tv-456", tmdbId: "456", title: "Test Show" });

    CONFIG.TMDB_API_KEY = originalKey;
  });

  it("does not enqueue sync-show-episodes job when TMDB_API_KEY is not set", async () => {
    const showTitle = makeParsedTitle({ id: "tv-789", objectType: "SHOW", tmdbId: "789", title: "Another Show" });
    await upsertTitles([showTitle]);

    const originalKey = CONFIG.TMDB_API_KEY;
    CONFIG.TMDB_API_KEY = "";

    const titleData = {
      id: "tv-789",
      object_type: "SHOW",
      tmdb_id: "789",
      title: "Another Show",
    };

    const res = await app.request("/track/tv-789", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ titleData }),
    });
    expect(res.status).toBe(200);

    const db = getRawDb();
    const job = db.prepare("SELECT * FROM jobs WHERE name = 'sync-show-episodes' AND json_extract(data, '$.titleId') = 'tv-789' LIMIT 1").get();
    expect(job).toBeNull();

    CONFIG.TMDB_API_KEY = originalKey;
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

  it("enqueues sync-show-episodes job for SHOW titles with tmdb_id and watched_episodes", async () => {
    const originalKey = CONFIG.TMDB_API_KEY;
    CONFIG.TMDB_API_KEY = "test-key";

    const exportData = {
      version: 1,
      exported_at: "2026-01-01T00:00:00Z",
      titles: [
        {
          id: "tv-999",
          tmdb_id: "999",
          object_type: "SHOW",
          title: "Test Show",
          genres: [],
          watched_episodes: [{ season: 1, episode: 1 }, { season: 1, episode: 2 }],
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

    const db = getRawDb();
    const job = db.prepare("SELECT * FROM jobs WHERE name = 'sync-show-episodes' AND json_extract(data, '$.titleId') = 'tv-999' LIMIT 1").get() as any;
    expect(job).toBeTruthy();
    const jobData = JSON.parse(job.data);
    expect(jobData).toMatchObject({ titleId: "tv-999", tmdbId: "999", title: "Test Show" });
    expect(jobData.watchedEpisodes).toEqual([{ season: 1, episode: 1 }, { season: 1, episode: 2 }]);
    expect(jobData.userId).toBeTruthy();

    CONFIG.TMDB_API_KEY = originalKey;
  });

  it("enqueues sync-show-episodes job without watchedEpisodes when show has no watched data", async () => {
    const originalKey = CONFIG.TMDB_API_KEY;
    CONFIG.TMDB_API_KEY = "test-key";

    const exportData = {
      version: 1,
      exported_at: "2026-01-01T00:00:00Z",
      titles: [
        {
          id: "tv-888",
          tmdb_id: "888",
          object_type: "SHOW",
          title: "Unwatched Show",
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

    const db = getRawDb();
    const job = db.prepare("SELECT * FROM jobs WHERE name = 'sync-show-episodes' AND json_extract(data, '$.titleId') = 'tv-888' LIMIT 1").get() as any;
    expect(job).toBeTruthy();
    const jobData = JSON.parse(job.data);
    expect(jobData.watchedEpisodes).toBeUndefined();
    expect(jobData.userId).toBeUndefined();

    CONFIG.TMDB_API_KEY = originalKey;
  });

  it("does not enqueue sync-show-episodes when TMDB_API_KEY is not set", async () => {
    const originalKey = CONFIG.TMDB_API_KEY;
    CONFIG.TMDB_API_KEY = "";

    const exportData = {
      version: 1,
      exported_at: "2026-01-01T00:00:00Z",
      titles: [
        {
          id: "tv-777",
          tmdb_id: "777",
          object_type: "SHOW",
          title: "No Key Show",
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

    const db = getRawDb();
    const job = db.prepare("SELECT * FROM jobs WHERE name = 'sync-show-episodes' AND json_extract(data, '$.titleId') = 'tv-777' LIMIT 1").get();
    expect(job).toBeNull();

    CONFIG.TMDB_API_KEY = originalKey;
  });

  it("enqueues backfill-title-offers job for imported titles with tmdb_id", async () => {
    const originalKey = CONFIG.TMDB_API_KEY;
    CONFIG.TMDB_API_KEY = "test-key";

    const exportData = {
      version: 1,
      exported_at: "2026-01-01T00:00:00Z",
      titles: [
        {
          id: "movie-600",
          tmdb_id: "600",
          object_type: "MOVIE",
          title: "Backfill Movie",
          genres: [],
          watched_episodes: [],
        },
        {
          id: "tv-601",
          tmdb_id: "601",
          object_type: "SHOW",
          title: "Backfill Show",
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
    expect(body.imported).toBe(2);

    const db = getRawDb();
    const movieJob = db.prepare("SELECT * FROM jobs WHERE name = 'backfill-title-offers' AND json_extract(data, '$.tmdbId') = '600' LIMIT 1").get() as any;
    expect(movieJob).toBeTruthy();
    expect(JSON.parse(movieJob.data)).toMatchObject({ tmdbId: "600", objectType: "MOVIE" });

    const showJob = db.prepare("SELECT * FROM jobs WHERE name = 'backfill-title-offers' AND json_extract(data, '$.tmdbId') = '601' LIMIT 1").get() as any;
    expect(showJob).toBeTruthy();
    expect(JSON.parse(showJob.data)).toMatchObject({ tmdbId: "601", objectType: "SHOW" });

    CONFIG.TMDB_API_KEY = originalKey;
  });

  it("does not enqueue backfill-title-offers when TMDB_API_KEY is not set", async () => {
    const originalKey = CONFIG.TMDB_API_KEY;
    CONFIG.TMDB_API_KEY = "";

    const exportData = {
      version: 1,
      exported_at: "2026-01-01T00:00:00Z",
      titles: [
        {
          id: "movie-602",
          tmdb_id: "602",
          object_type: "MOVIE",
          title: "No Key Movie",
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

    const db = getRawDb();
    const job = db.prepare("SELECT * FROM jobs WHERE name = 'backfill-title-offers' AND json_extract(data, '$.tmdbId') = '602' LIMIT 1").get();
    expect(job).toBeNull();

    CONFIG.TMDB_API_KEY = originalKey;
  });

  it("does not enqueue sync-show-episodes for MOVIE titles", async () => {
    const originalKey = CONFIG.TMDB_API_KEY;
    CONFIG.TMDB_API_KEY = "test-key";

    const exportData = {
      version: 1,
      exported_at: "2026-01-01T00:00:00Z",
      titles: [
        {
          id: "movie-555",
          tmdb_id: "555",
          object_type: "MOVIE",
          title: "Test Movie",
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

    const db = getRawDb();
    const job = db.prepare("SELECT * FROM jobs WHERE name = 'sync-show-episodes' AND json_extract(data, '$.titleId') = 'movie-555' LIMIT 1").get();
    expect(job).toBeNull();

    CONFIG.TMDB_API_KEY = originalKey;
  });
});

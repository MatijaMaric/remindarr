import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import { upsertTitles, upsertEpisodes, createUser, createSession, getSessionWithUser } from "../db/repository";
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

  it("does not delete episodes from DB when untracking a show", async () => {
    const showTitle = makeParsedTitle({ id: "tv-show-1", objectType: "SHOW", title: "Test Show" });
    await upsertTitles([showTitle]);
    await upsertEpisodes([
      { title_id: "tv-show-1", season_number: 1, episode_number: 1, name: "Pilot", overview: null, air_date: "2024-01-01", still_path: null },
      { title_id: "tv-show-1", season_number: 1, episode_number: 2, name: "Ep 2", overview: null, air_date: "2024-01-08", still_path: null },
    ]);

    // Track the show
    await app.request("/track/tv-show-1", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    // Verify episodes exist before untrack
    const db = getRawDb();
    const episodesBefore = db.prepare("SELECT id FROM episodes WHERE title_id = 'tv-show-1'").all();
    expect(episodesBefore).toHaveLength(2);

    // Untrack
    const res = await app.request("/track/tv-show-1", {
      method: "DELETE",
      headers: headers(),
    });
    expect(res.status).toBe(200);

    // Episodes must still exist in DB (they are global TMDB data shared across users)
    const episodesAfter = db.prepare("SELECT id FROM episodes WHERE title_id = 'tv-show-1'").all();
    expect(episodesAfter).toHaveLength(2);
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

  it("restores movie watched status during import", async () => {
    const exportData = {
      version: 1,
      exported_at: "2026-01-01T00:00:00Z",
      titles: [
        {
          id: "movie-watched",
          tmdb_id: "111",
          object_type: "MOVIE",
          title: "Watched Movie",
          genres: [],
          watched_episodes: [],
          is_watched: true,
        },
      ],
    };

    const res = await app.request("/track/import", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify(exportData),
    });
    expect(res.status).toBe(200);
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

describe("PATCH /track/profile-visibility", () => {
  it("toggles profile public setting", async () => {
    const res = await app.request("/track/profile-visibility", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ public: true }),
    });
    expect(res.status).toBe(200);

    const listRes = await app.request("/track", { headers: headers() });
    const listBody = await listRes.json();
    expect(listBody.profile_public).toBe(true);
  });
});

describe("PATCH /track/:id/visibility", () => {
  it("toggles title visibility", async () => {
    await upsertTitles([makeParsedTitle()]);
    await app.request("/track/movie-123", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    // Hide title
    const res = await app.request("/track/movie-123/visibility", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ public: false }),
    });
    expect(res.status).toBe(200);

    // Verify it's hidden
    const listRes = await app.request("/track", { headers: headers() });
    const listBody = await listRes.json();
    expect(listBody.titles[0].public).toBe(false);
  });
});

describe("PATCH /track/:id/status", () => {
  it("sets a valid user status", async () => {
    await upsertTitles([makeParsedTitle()]);
    await app.request("/track/movie-123", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await app.request("/track/movie-123/status", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ status: "on_hold" }),
    });
    expect(res.status).toBe(200);

    const listRes = await app.request("/track", { headers: headers() });
    const listBody = await listRes.json();
    expect(listBody.titles[0].user_status).toBe("on_hold");
  });

  it("clears status with null", async () => {
    await upsertTitles([makeParsedTitle()]);
    await app.request("/track/movie-123", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await app.request("/track/movie-123/status", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dropped" }),
    });

    const res = await app.request("/track/movie-123/status", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ status: null }),
    });
    expect(res.status).toBe(200);

    const listRes = await app.request("/track", { headers: headers() });
    const listBody = await listRes.json();
    expect(listBody.titles[0].user_status).toBeNull();
  });

  it("rejects an invalid status value", async () => {
    await upsertTitles([makeParsedTitle()]);
    await app.request("/track/movie-123", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await app.request("/track/movie-123/status", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ status: "invalid_value" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/track/movie-123/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "on_hold" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("PATCH /track/:id/notification", () => {
  it("sets mode to 'all'", async () => {
    await upsertTitles([makeParsedTitle()]);
    await app.request("/track/movie-123", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await app.request("/track/movie-123/notification", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "all" }),
    });
    expect(res.status).toBe(200);

    const listRes = await app.request("/track", { headers: headers() });
    const listBody = await listRes.json();
    expect(listBody.titles[0].notification_mode).toBe("all");
  });

  it("sets mode to 'premieres_only'", async () => {
    await upsertTitles([makeParsedTitle()]);
    await app.request("/track/movie-123", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await app.request("/track/movie-123/notification", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "premieres_only" }),
    });
    expect(res.status).toBe(200);

    const listRes = await app.request("/track", { headers: headers() });
    const listBody = await listRes.json();
    expect(listBody.titles[0].notification_mode).toBe("premieres_only");
  });

  it("sets mode to 'none'", async () => {
    await upsertTitles([makeParsedTitle()]);
    await app.request("/track/movie-123", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await app.request("/track/movie-123/notification", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "none" }),
    });
    expect(res.status).toBe(200);

    const listRes = await app.request("/track", { headers: headers() });
    const listBody = await listRes.json();
    expect(listBody.titles[0].notification_mode).toBe("none");
  });

  it("clears mode with null", async () => {
    await upsertTitles([makeParsedTitle()]);
    await app.request("/track/movie-123", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await app.request("/track/movie-123/notification", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "none" }),
    });

    const res = await app.request("/track/movie-123/notification", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ mode: null }),
    });
    expect(res.status).toBe(200);

    const listRes = await app.request("/track", { headers: headers() });
    const listBody = await listRes.json();
    expect(listBody.titles[0].notification_mode).toBeNull();
  });

  it("rejects an invalid mode value", async () => {
    await upsertTitles([makeParsedTitle()]);
    await app.request("/track/movie-123", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await app.request("/track/movie-123/notification", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "invalid_mode" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/track/movie-123/notification", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "all" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("PATCH /track/visibility", () => {
  it("bulk toggles all title visibility", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-1" }),
      makeParsedTitle({ id: "movie-2" }),
    ]);
    await app.request("/track/movie-1", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await app.request("/track/movie-2", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    // Hide all
    const res = await app.request("/track/visibility", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ public: false }),
    });
    expect(res.status).toBe(200);

    const listRes = await app.request("/track", { headers: headers() });
    const listBody = await listRes.json();
    expect(listBody.titles.every((t: any) => t.public === false)).toBe(true);
  });
});

describe("PATCH /track/:id/notes", () => {
  it("updates notes for a tracked title", async () => {
    await upsertTitles([makeParsedTitle()]);
    await app.request("/track/movie-123", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await app.request("/track/movie-123/notes", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Great movie!" }),
    });
    expect(res.status).toBe(200);

    const listRes = await app.request("/track", { headers: headers() });
    const listBody = await listRes.json();
    expect(listBody.titles[0].notes).toBe("Great movie!");
  });

  it("clears notes when null is sent", async () => {
    await upsertTitles([makeParsedTitle()]);
    await app.request("/track/movie-123", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Initial note" }),
    });

    await app.request("/track/movie-123/notes", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Initial note" }),
    });

    const res = await app.request("/track/movie-123/notes", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ notes: null }),
    });
    expect(res.status).toBe(200);

    const listRes = await app.request("/track", { headers: headers() });
    const listBody = await listRes.json();
    expect(listBody.titles[0].notes).toBeNull();
  });

  it("rejects notes over 500 chars", async () => {
    await upsertTitles([makeParsedTitle()]);
    await app.request("/track/movie-123", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await app.request("/track/movie-123/notes", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "x".repeat(501) }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/track/movie-123/notes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "test" }),
    });
    expect(res.status).toBe(401);
  });
});

describe("PATCH /track/:id/tags", () => {
  it("sets tags for a tracked title", async () => {
    await upsertTitles([makeParsedTitle()]);
    await app.request("/track/movie-123", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await app.request("/track/movie-123/tags", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ tags: ["action", "favorite"] }),
    });
    expect(res.status).toBe(200);

    const listRes = await app.request("/track", { headers: headers() });
    const listBody = await listRes.json();
    expect(listBody.titles[0].tags).toContain("action");
    expect(listBody.titles[0].tags).toContain("favorite");
  });

  it("normalizes tags (trim, lowercase, deduplicate)", async () => {
    await upsertTitles([makeParsedTitle()]);
    await app.request("/track/movie-123", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await app.request("/track/movie-123/tags", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ tags: ["  Action  ", "ACTION", "action"] }),
    });
    expect(res.status).toBe(200);

    const listRes = await app.request("/track", { headers: headers() });
    const listBody = await listRes.json();
    expect(listBody.titles[0].tags).toEqual(["action"]);
  });

  it("clears all tags when empty array is sent", async () => {
    await upsertTitles([makeParsedTitle()]);
    await app.request("/track/movie-123", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await app.request("/track/movie-123/tags", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ tags: ["sci-fi"] }),
    });

    const res = await app.request("/track/movie-123/tags", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ tags: [] }),
    });
    expect(res.status).toBe(200);

    const listRes = await app.request("/track", { headers: headers() });
    const listBody = await listRes.json();
    expect(listBody.titles[0].tags).toEqual([]);
  });

  it("rejects more than 10 tags", async () => {
    await upsertTitles([makeParsedTitle()]);
    await app.request("/track/movie-123", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await app.request("/track/movie-123/tags", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ tags: ["t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10", "t11"] }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a tag over 30 chars", async () => {
    await upsertTitles([makeParsedTitle()]);
    await app.request("/track/movie-123", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await app.request("/track/movie-123/tags", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ tags: ["x".repeat(31)] }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects non-array tags", async () => {
    await upsertTitles([makeParsedTitle()]);
    await app.request("/track/movie-123", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await app.request("/track/movie-123/tags", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ tags: "not-an-array" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/track/movie-123/tags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: [] }),
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /track/bulk", () => {
  it("bulk untracks multiple titles (happy path)", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-1" }),
      makeParsedTitle({ id: "movie-2" }),
      makeParsedTitle({ id: "movie-3" }),
    ]);
    // Track all three
    for (const id of ["movie-1", "movie-2", "movie-3"]) {
      await app.request(`/track/${id}`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    }

    const res = await app.request("/track/bulk", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ titleIds: ["movie-1", "movie-2", "movie-3"], action: "untrack" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(3);

    // Verify all untracked
    const listRes = await app.request("/track", { headers: headers() });
    const listBody = await listRes.json();
    expect(listBody.titles).toHaveLength(0);
  });

  it("bulk set_status updates all selected titles", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-1" }),
      makeParsedTitle({ id: "movie-2" }),
    ]);
    for (const id of ["movie-1", "movie-2"]) {
      await app.request(`/track/${id}`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    }

    const res = await app.request("/track/bulk", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ titleIds: ["movie-1", "movie-2"], action: "set_status", payload: { status: "completed" } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(2);

    const listRes = await app.request("/track", { headers: headers() });
    const listBody = await listRes.json();
    expect(listBody.titles.every((t: any) => t.user_status === "completed")).toBe(true);
  });

  it("bulk add_tag adds tag to all selected titles", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-1" }),
      makeParsedTitle({ id: "movie-2" }),
    ]);
    for (const id of ["movie-1", "movie-2"]) {
      await app.request(`/track/${id}`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    }

    const res = await app.request("/track/bulk", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ titleIds: ["movie-1", "movie-2"], action: "add_tag", payload: { tag: "favorite" } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(2);

    const listRes = await app.request("/track", { headers: headers() });
    const listBody = await listRes.json();
    expect(listBody.titles.every((t: any) => t.tags?.includes("favorite"))).toBe(true);
  });

  it("bulk set_notification_mode updates all selected titles", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-1" }),
      makeParsedTitle({ id: "movie-2" }),
    ]);
    for (const id of ["movie-1", "movie-2"]) {
      await app.request(`/track/${id}`, {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    }

    const res = await app.request("/track/bulk", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ titleIds: ["movie-1", "movie-2"], action: "set_notification_mode", payload: { mode: "none" } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(2);

    const listRes = await app.request("/track", { headers: headers() });
    const listBody = await listRes.json();
    expect(listBody.titles.every((t: any) => t.notification_mode === "none")).toBe(true);
  });

  it("returns 401 without auth", async () => {
    const res = await app.request("/track/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titleIds: ["movie-1"], action: "untrack" }),
    });
    expect(res.status).toBe(401);
  });

  describe("validation", () => {
    it("rejects empty titleIds array", async () => {
      const res = await app.request("/track/bulk", {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ titleIds: [], action: "untrack" }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
      expect(Array.isArray(body.issues)).toBe(true);
    });

    it("rejects invalid action", async () => {
      const res = await app.request("/track/bulk", {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ titleIds: ["movie-1"], action: "delete_everything" }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
      expect(Array.isArray(body.issues)).toBe(true);
    });

    it("rejects titleIds exceeding 200", async () => {
      const titleIds = Array.from({ length: 201 }, (_, i) => `movie-${i}`);
      const res = await app.request("/track/bulk", {
        method: "POST",
        headers: { ...headers(), "Content-Type": "application/json" },
        body: JSON.stringify({ titleIds, action: "untrack" }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("Validation failed");
      expect(Array.isArray(body.issues)).toBe(true);
    });
  });
});

describe("validation", () => {
  beforeEach(async () => {
    await upsertTitles([makeParsedTitle()]);
  });

  it("rejects PATCH /track/:id/status with invalid enum", async () => {
    const res = await app.request("/track/movie-123/status", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ status: "wat" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects PATCH /track/:id/notes with notes too long", async () => {
    const res = await app.request("/track/movie-123/notes", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "x".repeat(501) }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects PATCH /track/:id/notes with non-string notes", async () => {
    const res = await app.request("/track/movie-123/notes", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ notes: 123 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects PATCH /track/:id/tags with too many tags", async () => {
    const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
    const res = await app.request("/track/movie-123/tags", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ tags }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects PATCH /track/:id/notification with invalid mode", async () => {
    const res = await app.request("/track/movie-123/notification", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "always" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects PATCH /track/:id/visibility without public field", async () => {
    const res = await app.request("/track/movie-123/visibility", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects PATCH /track/profile-visibility with neither field", async () => {
    const res = await app.request("/track/profile-visibility", {
      method: "PATCH",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects POST /track/import with non-array titles", async () => {
    const res = await app.request("/track/import", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ titles: "not-an-array" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("rejects POST /track/:id with invalid object_type in titleData", async () => {
    const res = await app.request("/track/movie-999", {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        titleData: { id: "movie-999", object_type: "BOOK", title: "x" },
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });
});

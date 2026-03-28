import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import { upsertTitles, createUser, createSession, getSessionWithUser, trackTitle, updateProfilePublic, updateTrackedVisibility } from "../db/repository";
import { watchTitle } from "../db/repository";
import { upsertEpisodes, watchEpisode } from "../db/repository";
import { optionalAuth } from "../middleware/auth";
import profileApp from "./profile";
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
let userId: string;
let userToken: string;

beforeEach(async () => {
  setupTestDb();

  userId = await createUser("testuser", "hash", "Test User");
  userToken = await createSession(userId);

  app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("auth", createMockAuth() as any);
    await next();
  });
  app.use("/user/*", optionalAuth);
  app.route("/user", profileApp);
});

afterAll(() => {
  teardownTestDb();
});

function authHeaders() {
  return { Cookie: `better-auth.session_token=${userToken}` };
}

describe("GET /user/:username", () => {
  it("returns public profile for existing user", async () => {
    const res = await app.request("/user/testuser");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.username).toBe("testuser");
    expect(body.user.display_name).toBe("Test User");
    expect(body.user.member_since).toBeTruthy();
    expect(body.stats.tracked_count).toBe(0);
    expect(body.stats.watched_movies).toBe(0);
    expect(body.stats.watched_episodes).toBe(0);
    expect(body.movies).toHaveLength(0);
    expect(body.shows).toHaveLength(0);
    expect(body.show_watchlist).toBe(false);
    expect(body.is_own_profile).toBe(false);
  });

  it("returns 404 for nonexistent username", async () => {
    const res = await app.request("/user/nobody");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("User not found");
  });

  it("is_own_profile is true when authenticated user matches", async () => {
    const res = await app.request("/user/testuser", { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.is_own_profile).toBe(true);
  });

  it("is_own_profile is false for different user", async () => {
    const otherUserId = await createUser("otheruser", "hash");
    const otherToken = await createSession(otherUserId);

    const res = await app.request("/user/testuser", {
      headers: { Cookie: `better-auth.session_token=${otherToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.is_own_profile).toBe(false);
  });

  it("case-insensitive username lookup", async () => {
    const res = await app.request("/user/TestUser");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.username).toBe("testuser");
  });

  it("does not leak sensitive fields", async () => {
    const res = await app.request("/user/testuser");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBeUndefined();
    expect(body.user.password_hash).toBeUndefined();
    expect(body.user.is_admin).toBeUndefined();
    expect(body.user.role).toBeUndefined();
    expect(body.user.id).toBeUndefined();
  });

  it("hides watchlist when profile_public is false (default)", async () => {
    await upsertTitles([makeParsedTitle()]);
    await trackTitle("movie-123", userId);

    const res = await app.request("/user/testuser");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.show_watchlist).toBe(false);
    expect(body.movies).toHaveLength(0);
    expect(body.shows).toHaveLength(0);
    expect(body.stats.tracked_count).toBe(0);
  });

  it("shows public watchlist when profile_public is true", async () => {
    await updateProfilePublic(userId, true);
    await upsertTitles([makeParsedTitle()]);
    await trackTitle("movie-123", userId);

    const res = await app.request("/user/testuser");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.show_watchlist).toBe(true);
    expect(body.movies).toHaveLength(1);
    expect(body.shows).toHaveLength(0);
    expect(body.stats.tracked_count).toBe(1);
  });

  it("excludes hidden titles when profile is public", async () => {
    await updateProfilePublic(userId, true);
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", title: "Visible Movie" }),
      makeParsedTitle({ id: "movie-2", title: "Hidden Movie" }),
    ]);
    await trackTitle("movie-1", userId);
    await trackTitle("movie-2", userId);
    await updateTrackedVisibility("movie-2", userId, false);

    const res = await app.request("/user/testuser");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.movies).toHaveLength(1);
    expect(body.movies[0].id).toBe("movie-1");
    expect(body.stats.tracked_count).toBe(1);
  });

  it("includes watched movie/episode stats regardless of watchlist visibility", async () => {
    await upsertTitles([makeParsedTitle()]);
    await trackTitle("movie-123", userId);
    await watchTitle("movie-123", userId);

    const res = await app.request("/user/testuser");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats.watched_movies).toBe(1);
  });

  it("separates movies and shows into distinct arrays", async () => {
    await updateProfilePublic(userId, true);
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", objectType: "MOVIE", title: "Test Movie" }),
      makeParsedTitle({ id: "show-1", objectType: "SHOW", title: "Test Show" }),
    ]);
    await trackTitle("movie-1", userId);
    await trackTitle("show-1", userId);

    const res = await app.request("/user/testuser");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.movies).toHaveLength(1);
    expect(body.movies[0].id).toBe("movie-1");
    expect(body.movies[0].object_type).toBe("MOVIE");
    expect(body.shows).toHaveLength(1);
    expect(body.shows[0].id).toBe("show-1");
    expect(body.shows[0].object_type).toBe("SHOW");
  });

  it("includes is_watched status for movies", async () => {
    await updateProfilePublic(userId, true);
    await upsertTitles([
      makeParsedTitle({ id: "movie-1", title: "Watched Movie" }),
      makeParsedTitle({ id: "movie-2", title: "Unwatched Movie" }),
    ]);
    await trackTitle("movie-1", userId);
    await trackTitle("movie-2", userId);
    await watchTitle("movie-1", userId);

    const res = await app.request("/user/testuser");
    expect(res.status).toBe(200);
    const body = await res.json();
    const watched = body.movies.find((m: any) => m.id === "movie-1");
    const unwatched = body.movies.find((m: any) => m.id === "movie-2");
    expect(watched.is_watched).toBe(true);
    expect(unwatched.is_watched).toBe(false);
  });

  it("includes episode progress for shows", async () => {
    await updateProfilePublic(userId, true);
    await upsertTitles([
      makeParsedTitle({ id: "show-1", objectType: "SHOW", title: "Test Show" }),
    ]);
    await trackTitle("show-1", userId);

    await upsertEpisodes([
      { title_id: "show-1", season_number: 1, episode_number: 1, name: "Ep 1", overview: null, air_date: "2024-01-01", still_path: null },
      { title_id: "show-1", season_number: 1, episode_number: 2, name: "Ep 2", overview: null, air_date: "2024-01-08", still_path: null },
      { title_id: "show-1", season_number: 1, episode_number: 3, name: "Ep 3", overview: null, air_date: "2024-01-15", still_path: null },
    ]);

    // Watch 1 of 3 episodes — need to get the episode ID first
    const { getDb } = await import("../db/schema");
    const db = getDb();
    const eps = await db.query.episodes.findMany({ where: (e, { eq }) => eq(e.titleId, "show-1") });
    await watchEpisode(eps[0].id, userId);

    const res = await app.request("/user/testuser");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.shows).toHaveLength(1);
    expect(body.shows[0].total_episodes).toBe(3);
    expect(body.shows[0].watched_episodes_count).toBe(1);
  });
});

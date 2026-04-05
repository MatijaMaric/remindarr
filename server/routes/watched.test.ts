import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import { upsertTitles, upsertEpisodes, createUser, getTitleById } from "../db/repository";
import { getRawDb } from "../db/bun-db";
import watchedApp from "./watched";
import type { AppEnv } from "../types";

let userId: string;

function makeAuthedApp() {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: userId, username: "testuser", name: null, role: null, is_admin: false });
    await next();
  });
  a.route("/watched", watchedApp);
  return a;
}

async function getEpisodeId(titleId: string, season: number, episode: number): Promise<number> {
  const db = getRawDb();
  const row = db
    .prepare("SELECT id FROM episodes WHERE title_id = ? AND season_number = ? AND episode_number = ?")
    .get(titleId, season, episode) as { id: number } | undefined;
  return row!.id;
}

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("testuser", "hash");
});

afterAll(() => {
  teardownTestDb();
});

describe("POST /watched/:episodeId", () => {
  it("allows marking a past episode as watched", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await upsertTitles([makeParsedTitle({ id: "show-1", objectType: "SHOW" })]);
    await upsertEpisodes([
      { title_id: "show-1", season_number: 1, episode_number: 1, name: "Pilot", overview: null, air_date: today, still_path: null },
    ]);
    const episodeId = await getEpisodeId("show-1", 1, 1);

    const app = makeAuthedApp();
    const res = await app.request(`/watched/${episodeId}`, { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("marking the same episode twice does not error (idempotent)", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await upsertTitles([makeParsedTitle({ id: "show-1b", objectType: "SHOW" })]);
    await upsertEpisodes([
      { title_id: "show-1b", season_number: 1, episode_number: 1, name: "Ep1", overview: null, air_date: today, still_path: null },
    ]);
    const episodeId = await getEpisodeId("show-1b", 1, 1);

    const app = makeAuthedApp();
    await app.request(`/watched/${episodeId}`, { method: "POST" });
    const res = await app.request(`/watched/${episodeId}`, { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("rejects marking a future episode as watched", async () => {
    const future = new Date();
    future.setDate(future.getDate() + 7);
    const futureStr = future.toISOString().slice(0, 10);

    await upsertTitles([makeParsedTitle({ id: "show-2", objectType: "SHOW" })]);
    await upsertEpisodes([
      { title_id: "show-2", season_number: 1, episode_number: 1, name: "Future Ep", overview: null, air_date: futureStr, still_path: null },
    ]);
    const episodeId = await getEpisodeId("show-2", 1, 1);

    const app = makeAuthedApp();
    const res = await app.request(`/watched/${episodeId}`, { method: "POST" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("unreleased");
  });

  it("respects X-Timezone header when checking release status", async () => {
    const future = new Date();
    future.setDate(future.getDate() + 7);
    const futureStr = future.toISOString().slice(0, 10);

    await upsertTitles([makeParsedTitle({ id: "show-tz", objectType: "SHOW" })]);
    await upsertEpisodes([
      { title_id: "show-tz", season_number: 1, episode_number: 1, name: "Future Ep", overview: null, air_date: futureStr, still_path: null },
    ]);
    const episodeId = await getEpisodeId("show-tz", 1, 1);

    const app = makeAuthedApp();
    // Even with a far-ahead timezone, future episode is still in the future
    const res = await app.request(`/watched/${episodeId}`, {
      method: "POST",
      headers: { "X-Timezone": "Pacific/Auckland" },
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-numeric episodeId", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/watched/abc", { method: "POST" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid episodeId");
  });

  it("returns 400 when episode does not exist", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/watched/99999", { method: "POST" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("unreleased");
  });
});

describe("DELETE /watched/:episodeId", () => {
  it("unmarks a watched episode", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await upsertTitles([makeParsedTitle({ id: "show-3", objectType: "SHOW" })]);
    await upsertEpisodes([
      { title_id: "show-3", season_number: 1, episode_number: 1, name: "Ep1", overview: null, air_date: today, still_path: null },
    ]);
    const episodeId = await getEpisodeId("show-3", 1, 1);

    const app = makeAuthedApp();
    await app.request(`/watched/${episodeId}`, { method: "POST" });

    const res = await app.request(`/watched/${episodeId}`, { method: "DELETE" });
    expect(res.status).toBe(200);
  });

  it("unwatch on an unwatched episode is a no-op", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await upsertTitles([makeParsedTitle({ id: "show-3b", objectType: "SHOW" })]);
    await upsertEpisodes([
      { title_id: "show-3b", season_number: 1, episode_number: 1, name: "Ep1", overview: null, air_date: today, still_path: null },
    ]);
    const episodeId = await getEpisodeId("show-3b", 1, 1);

    const app = makeAuthedApp();
    const res = await app.request(`/watched/${episodeId}`, { method: "DELETE" });
    expect(res.status).toBe(200);
  });

  it("returns 400 for non-numeric episodeId", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/watched/abc", { method: "DELETE" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid episodeId");
  });
});

describe("POST /watched/bulk", () => {
  it("marks multiple released episodes as watched", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    await upsertTitles([makeParsedTitle({ id: "show-4", objectType: "SHOW" })]);
    await upsertEpisodes([
      { title_id: "show-4", season_number: 1, episode_number: 1, name: "Ep1", overview: null, air_date: yesterdayStr, still_path: null },
      { title_id: "show-4", season_number: 1, episode_number: 2, name: "Ep2", overview: null, air_date: yesterdayStr, still_path: null },
    ]);
    const ep1Id = await getEpisodeId("show-4", 1, 1);
    const ep2Id = await getEpisodeId("show-4", 1, 2);

    const app = makeAuthedApp();
    const res = await app.request("/watched/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds: [ep1Id, ep2Id], watched: true }),
    });
    expect(res.status).toBe(200);
  });

  it("only marks released episodes as watched in bulk", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    const future = new Date();
    future.setDate(future.getDate() + 7);
    const futureStr = future.toISOString().slice(0, 10);

    await upsertTitles([makeParsedTitle({ id: "show-4b", objectType: "SHOW" })]);
    await upsertEpisodes([
      { title_id: "show-4b", season_number: 1, episode_number: 1, name: "Aired", overview: null, air_date: yesterdayStr, still_path: null },
      { title_id: "show-4b", season_number: 1, episode_number: 2, name: "Future", overview: null, air_date: futureStr, still_path: null },
    ]);
    const releasedId = await getEpisodeId("show-4b", 1, 1);
    const futureId = await getEpisodeId("show-4b", 1, 2);

    const app = makeAuthedApp();
    const res = await app.request("/watched/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds: [releasedId, futureId], watched: true }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 400 when all episodeIds are unreleased", async () => {
    const future = new Date();
    future.setDate(future.getDate() + 7);
    const futureStr = future.toISOString().slice(0, 10);

    await upsertTitles([makeParsedTitle({ id: "show-5", objectType: "SHOW" })]);
    await upsertEpisodes([
      { title_id: "show-5", season_number: 1, episode_number: 1, name: "Future Ep", overview: null, air_date: futureStr, still_path: null },
    ]);
    const ep1Id = await getEpisodeId("show-5", 1, 1);

    const app = makeAuthedApp();
    const res = await app.request("/watched/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds: [ep1Id], watched: true }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("unreleased");
  });

  it("bulk unwatch succeeds for released and unreleased episodes", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    await upsertTitles([makeParsedTitle({ id: "show-6", objectType: "SHOW" })]);
    await upsertEpisodes([
      { title_id: "show-6", season_number: 1, episode_number: 1, name: "Ep1", overview: null, air_date: yesterdayStr, still_path: null },
    ]);
    const ep1Id = await getEpisodeId("show-6", 1, 1);

    const app = makeAuthedApp();
    // Watch first
    await app.request("/watched/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds: [ep1Id], watched: true }),
    });

    // Now unwatch
    const res = await app.request("/watched/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds: [ep1Id], watched: false }),
    });
    expect(res.status).toBe(200);
  });

  it("returns 400 for empty episodeIds", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/watched/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds: [], watched: true }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("episodeIds");
  });

  it("returns 400 when episodeIds is missing", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/watched/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watched: true }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("episodeIds");
  });
});

describe("POST /watched/movies/:titleId", () => {
  it("marks a movie as watched", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-w1", objectType: "MOVIE" })]);

    const app = makeAuthedApp();
    const res = await app.request("/watched/movies/movie-w1", { method: "POST" });
    expect(res.status).toBe(200);

    const title = await getTitleById("movie-w1", userId);
    expect(title!.is_watched).toBe(true);
  });

  it("is idempotent — marking twice does not error", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-w2", objectType: "MOVIE" })]);

    const app = makeAuthedApp();
    await app.request("/watched/movies/movie-w2", { method: "POST" });
    const res = await app.request("/watched/movies/movie-w2", { method: "POST" });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /watched/movies/:titleId", () => {
  it("unmarks a watched movie", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-w3", objectType: "MOVIE" })]);

    const app = makeAuthedApp();
    await app.request("/watched/movies/movie-w3", { method: "POST" });
    const res = await app.request("/watched/movies/movie-w3", { method: "DELETE" });
    expect(res.status).toBe(200);

    const title = await getTitleById("movie-w3", userId);
    expect(title!.is_watched).toBe(false);
  });

  it("unwatch on an unwatched movie is a no-op", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-w4", objectType: "MOVIE" })]);

    const app = makeAuthedApp();
    const res = await app.request("/watched/movies/movie-w4", { method: "DELETE" });
    expect(res.status).toBe(200);
  });
});

describe("Watch history logging", () => {
  it("marking an episode watched logs a history entry", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await upsertTitles([makeParsedTitle({ id: "show-hist-1", objectType: "SHOW" })]);
    await upsertEpisodes([
      { title_id: "show-hist-1", season_number: 1, episode_number: 1, name: "Ep1", overview: null, air_date: today, still_path: null },
    ]);
    const episodeId = await getEpisodeId("show-hist-1", 1, 1);

    const app = makeAuthedApp();
    await app.request(`/watched/${episodeId}`, { method: "POST" });

    const db = getRawDb();
    const row = db.prepare("SELECT COUNT(*) as cnt FROM watch_history WHERE user_id = ? AND title_id = ? AND episode_id = ?")
      .get(userId, "show-hist-1", episodeId) as { cnt: number };
    expect(row.cnt).toBe(1);
  });

  it("marking the same episode watched twice increments play count to 2", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await upsertTitles([makeParsedTitle({ id: "show-hist-2", objectType: "SHOW" })]);
    await upsertEpisodes([
      { title_id: "show-hist-2", season_number: 1, episode_number: 1, name: "Ep1", overview: null, air_date: today, still_path: null },
    ]);
    const episodeId = await getEpisodeId("show-hist-2", 1, 1);

    const app = makeAuthedApp();
    await app.request(`/watched/${episodeId}`, { method: "POST" });
    await app.request(`/watched/${episodeId}`, { method: "POST" });

    const db = getRawDb();
    const row = db.prepare("SELECT COUNT(*) as cnt FROM watch_history WHERE user_id = ? AND title_id = ?")
      .get(userId, "show-hist-2") as { cnt: number };
    expect(row.cnt).toBe(2);
  });

  it("marking a movie watched logs a history entry", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-hist-1", objectType: "MOVIE" })]);

    const app = makeAuthedApp();
    await app.request("/watched/movies/movie-hist-1", { method: "POST" });

    const db = getRawDb();
    const row = db.prepare("SELECT COUNT(*) as cnt FROM watch_history WHERE user_id = ? AND title_id = ?")
      .get(userId, "movie-hist-1") as { cnt: number };
    expect(row.cnt).toBe(1);
  });

  it("bulk watch logs history for each released episode", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    await upsertTitles([makeParsedTitle({ id: "show-hist-bulk", objectType: "SHOW" })]);
    await upsertEpisodes([
      { title_id: "show-hist-bulk", season_number: 1, episode_number: 1, name: "Ep1", overview: null, air_date: yesterdayStr, still_path: null },
      { title_id: "show-hist-bulk", season_number: 1, episode_number: 2, name: "Ep2", overview: null, air_date: yesterdayStr, still_path: null },
    ]);
    const ep1Id = await getEpisodeId("show-hist-bulk", 1, 1);
    const ep2Id = await getEpisodeId("show-hist-bulk", 1, 2);

    const app = makeAuthedApp();
    await app.request("/watched/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds: [ep1Id, ep2Id], watched: true }),
    });

    const db = getRawDb();
    const row = db.prepare("SELECT COUNT(*) as cnt FROM watch_history WHERE user_id = ? AND title_id = ?")
      .get(userId, "show-hist-bulk") as { cnt: number };
    expect(row.cnt).toBe(2);
  });
});

describe("GET /watched/history/:titleId", () => {
  it("returns empty history and 0 play count for a title with no watches", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-nowatch", objectType: "MOVIE" })]);

    const app = makeAuthedApp();
    const res = await app.request("/watched/history/movie-nowatch");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.playCount).toBe(0);
    expect(body.history).toEqual([]);
  });

  it("returns correct history and play count after watching a movie", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-hist-get", objectType: "MOVIE" })]);

    const app = makeAuthedApp();
    await app.request("/watched/movies/movie-hist-get", { method: "POST" });
    await app.request("/watched/movies/movie-hist-get", { method: "POST" });

    const res = await app.request("/watched/history/movie-hist-get");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.playCount).toBe(2);
    expect(body.history.length).toBe(2);
    // Newest first
    expect(new Date(body.history[0].watchedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(body.history[1].watchedAt).getTime()
    );
  });

  it("history entries for episodes include episodeId", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await upsertTitles([makeParsedTitle({ id: "show-hist-ep", objectType: "SHOW" })]);
    await upsertEpisodes([
      { title_id: "show-hist-ep", season_number: 1, episode_number: 1, name: "Ep1", overview: null, air_date: today, still_path: null },
    ]);
    const episodeId = await getEpisodeId("show-hist-ep", 1, 1);

    const app = makeAuthedApp();
    await app.request(`/watched/${episodeId}`, { method: "POST" });

    const res = await app.request("/watched/history/show-hist-ep");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.playCount).toBe(1);
    expect(body.history[0].episodeId).toBe(episodeId);
  });
});

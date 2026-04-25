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

});

describe("POST /watched/bulk validation", () => {
  it("returns 400 with issues array for empty episodeIds", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/watched/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds: [], watched: true }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it("returns 400 with issues array when episodeIds is missing", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/watched/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watched: true }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("returns 400 when watched is not a boolean", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/watched/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds: [1], watched: "yes" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 400 when useAirDate is not a boolean", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/watched/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds: [1], watched: true, useAirDate: "yes" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
  });
});

describe("POST /watched/backdate", () => {
  it("backdates all watched episodes for a single title to their air dates", async () => {
    const date1 = "2024-01-15";
    const date2 = "2024-02-20";

    await upsertTitles([makeParsedTitle({ id: "show-bd-1", objectType: "SHOW" })]);
    await upsertEpisodes([
      { title_id: "show-bd-1", season_number: 1, episode_number: 1, name: "Ep1", overview: null, air_date: date1, still_path: null },
      { title_id: "show-bd-1", season_number: 1, episode_number: 2, name: "Ep2", overview: null, air_date: date2, still_path: null },
    ]);
    const ep1Id = await getEpisodeId("show-bd-1", 1, 1);
    const ep2Id = await getEpisodeId("show-bd-1", 1, 2);

    const app = makeAuthedApp();
    // Mark watched without useAirDate (uses current timestamp).
    await app.request("/watched/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds: [ep1Id, ep2Id], watched: true }),
    });

    const res = await app.request("/watched/backdate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "show-bd-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(2);

    const db = getRawDb();
    const ep1Row = db.prepare("SELECT watched_at FROM watched_episodes WHERE episode_id = ? AND user_id = ?")
      .get(ep1Id, userId) as { watched_at: string };
    const ep2Row = db.prepare("SELECT watched_at FROM watched_episodes WHERE episode_id = ? AND user_id = ?")
      .get(ep2Id, userId) as { watched_at: string };
    expect(ep1Row.watched_at).toBe(`${date1} 00:00:00`);
    expect(ep2Row.watched_at).toBe(`${date2} 00:00:00`);
  });

  it("backdates all watched episodes across all tracked shows when titleId is omitted", async () => {
    const dateA = "2024-03-10";
    const dateB = "2024-04-01";

    await upsertTitles([
      makeParsedTitle({ id: "show-bd-A", objectType: "SHOW" }),
      makeParsedTitle({ id: "show-bd-B", objectType: "SHOW" }),
    ]);
    await upsertEpisodes([
      { title_id: "show-bd-A", season_number: 1, episode_number: 1, name: "A1", overview: null, air_date: dateA, still_path: null },
      { title_id: "show-bd-B", season_number: 1, episode_number: 1, name: "B1", overview: null, air_date: dateB, still_path: null },
    ]);
    const epAId = await getEpisodeId("show-bd-A", 1, 1);
    const epBId = await getEpisodeId("show-bd-B", 1, 1);

    const app = makeAuthedApp();
    await app.request("/watched/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds: [epAId, epBId], watched: true }),
    });

    const res = await app.request("/watched/backdate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(2);

    const db = getRawDb();
    const rowA = db.prepare("SELECT watched_at FROM watched_episodes WHERE episode_id = ? AND user_id = ?")
      .get(epAId, userId) as { watched_at: string };
    const rowB = db.prepare("SELECT watched_at FROM watched_episodes WHERE episode_id = ? AND user_id = ?")
      .get(epBId, userId) as { watched_at: string };
    expect(rowA.watched_at).toBe(`${dateA} 00:00:00`);
    expect(rowB.watched_at).toBe(`${dateB} 00:00:00`);
  });

  it("only touches episodes belonging to the requested title", async () => {
    const dateA = "2024-05-01";
    const dateB = "2024-06-01";

    await upsertTitles([
      makeParsedTitle({ id: "show-bd-only-A", objectType: "SHOW" }),
      makeParsedTitle({ id: "show-bd-only-B", objectType: "SHOW" }),
    ]);
    await upsertEpisodes([
      { title_id: "show-bd-only-A", season_number: 1, episode_number: 1, name: "A1", overview: null, air_date: dateA, still_path: null },
      { title_id: "show-bd-only-B", season_number: 1, episode_number: 1, name: "B1", overview: null, air_date: dateB, still_path: null },
    ]);
    const epAId = await getEpisodeId("show-bd-only-A", 1, 1);
    const epBId = await getEpisodeId("show-bd-only-B", 1, 1);

    const app = makeAuthedApp();
    await app.request("/watched/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds: [epAId, epBId], watched: true }),
    });

    const db = getRawDb();
    const rowBBefore = db.prepare("SELECT watched_at FROM watched_episodes WHERE episode_id = ? AND user_id = ?")
      .get(epBId, userId) as { watched_at: string };

    const res = await app.request("/watched/backdate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "show-bd-only-A" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(1);

    const rowA = db.prepare("SELECT watched_at FROM watched_episodes WHERE episode_id = ? AND user_id = ?")
      .get(epAId, userId) as { watched_at: string };
    const rowBAfter = db.prepare("SELECT watched_at FROM watched_episodes WHERE episode_id = ? AND user_id = ?")
      .get(epBId, userId) as { watched_at: string };
    expect(rowA.watched_at).toBe(`${dateA} 00:00:00`);
    // show-bd-only-B was not touched.
    expect(rowBAfter.watched_at).toBe(rowBBefore.watched_at);
  });

  it("skips watched episodes with no air_date", async () => {
    await upsertTitles([makeParsedTitle({ id: "show-bd-noair", objectType: "SHOW" })]);
    await upsertEpisodes([
      { title_id: "show-bd-noair", season_number: 1, episode_number: 1, name: "Ep1", overview: null, air_date: null, still_path: null },
    ]);
    const epId = await getEpisodeId("show-bd-noair", 1, 1);

    // Mark watched directly bypassing the released-only check.
    const db = getRawDb();
    db.prepare("INSERT INTO watched_episodes (episode_id, user_id, watched_at) VALUES (?, ?, ?)")
      .run(epId, userId, "2024-07-15 12:00:00");

    const app = makeAuthedApp();
    const res = await app.request("/watched/backdate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: "show-bd-noair" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(0);

    const row = db.prepare("SELECT watched_at FROM watched_episodes WHERE episode_id = ? AND user_id = ?")
      .get(epId, userId) as { watched_at: string };
    expect(row.watched_at).toBe("2024-07-15 12:00:00");
  });

  it("returns 0 updated when user has no watched episodes", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/watched/backdate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(0);
  });

  it("returns 400 when titleId is not a string", async () => {
    const app = makeAuthedApp();
    const res = await app.request("/watched/backdate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ titleId: 123 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
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

  it("bulk watch with useAirDate sets watched_at to each episode's air date", async () => {
    const date1 = "2024-01-15";
    const date2 = "2024-02-20";

    await upsertTitles([makeParsedTitle({ id: "show-air-1", objectType: "SHOW" })]);
    await upsertEpisodes([
      { title_id: "show-air-1", season_number: 1, episode_number: 1, name: "Ep1", overview: null, air_date: date1, still_path: null },
      { title_id: "show-air-1", season_number: 1, episode_number: 2, name: "Ep2", overview: null, air_date: date2, still_path: null },
    ]);
    const ep1Id = await getEpisodeId("show-air-1", 1, 1);
    const ep2Id = await getEpisodeId("show-air-1", 1, 2);

    const app = makeAuthedApp();
    const res = await app.request("/watched/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds: [ep1Id, ep2Id], watched: true, useAirDate: true }),
    });
    expect(res.status).toBe(200);

    const db = getRawDb();
    const ep1Row = db.prepare("SELECT watched_at FROM watched_episodes WHERE episode_id = ? AND user_id = ?")
      .get(ep1Id, userId) as { watched_at: string };
    const ep2Row = db.prepare("SELECT watched_at FROM watched_episodes WHERE episode_id = ? AND user_id = ?")
      .get(ep2Id, userId) as { watched_at: string };
    expect(ep1Row.watched_at).toBe(`${date1} 00:00:00`);
    expect(ep2Row.watched_at).toBe(`${date2} 00:00:00`);

    // Watch history should also use the air date
    const histRow1 = db.prepare("SELECT watched_at FROM watch_history WHERE user_id = ? AND episode_id = ?")
      .get(userId, ep1Id) as { watched_at: string };
    const histRow2 = db.prepare("SELECT watched_at FROM watch_history WHERE user_id = ? AND episode_id = ?")
      .get(userId, ep2Id) as { watched_at: string };
    expect(histRow1.watched_at).toBe(`${date1} 00:00:00`);
    expect(histRow2.watched_at).toBe(`${date2} 00:00:00`);
  });

  it("bulk watch without useAirDate uses current timestamp", async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    await upsertTitles([makeParsedTitle({ id: "show-air-2", objectType: "SHOW" })]);
    await upsertEpisodes([
      { title_id: "show-air-2", season_number: 1, episode_number: 1, name: "Ep1", overview: null, air_date: yesterdayStr, still_path: null },
    ]);
    const ep1Id = await getEpisodeId("show-air-2", 1, 1);

    const app = makeAuthedApp();
    const res = await app.request("/watched/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds: [ep1Id], watched: true }),
    });
    expect(res.status).toBe(200);

    const db = getRawDb();
    const row = db.prepare("SELECT watched_at FROM watched_episodes WHERE episode_id = ? AND user_id = ?")
      .get(ep1Id, userId) as { watched_at: string };
    // Default is datetime('now') — should not equal the air date
    expect(row.watched_at).not.toBe(`${yesterdayStr} 00:00:00`);
    // Should be today's UTC date
    const todayUtc = new Date().toISOString().slice(0, 10);
    expect(row.watched_at.startsWith(todayUtc)).toBe(true);
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

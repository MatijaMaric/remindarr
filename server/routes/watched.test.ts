import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import type { AppEnv } from "../types";

let app: Hono<AppEnv>;
let userId: string;

beforeEach(async () => {
  setupTestDb();

  const { createUser, upsertEpisodes, upsertTitles } = await import("../db/repository");
  userId = await createUser("testuser", "hash");

  await upsertTitles([makeParsedTitle({
    id: "show-1",
    objectType: "SHOW",
    title: "Test Show",
    originalTitle: "Test Show",
    releaseYear: 2024,
    releaseDate: "2024-01-01",
  })]);

  // Insert episodes: one in the past, one today (UTC), one in the future
  await upsertEpisodes([
    {
      title_id: "show-1",
      season_number: 1,
      episode_number: 1,
      name: "Past Episode",
      overview: null,
      air_date: "2000-01-01",
      still_path: null,
    },
    {
      title_id: "show-1",
      season_number: 1,
      episode_number: 2,
      name: "Future Episode",
      overview: null,
      air_date: "2099-12-31",
      still_path: null,
    },
  ]);

  const watchedApp = (await import("./watched")).default;
  app = new Hono<AppEnv>();
  app.use("/watched/*", async (c, next) => {
    c.set("user", { id: userId, username: "testuser", name: null, role: null, is_admin: false });
    await next();
  });
  app.route("/watched", watchedApp);
});

afterAll(() => {
  teardownTestDb();
});

describe("POST /watched/:episodeId", () => {
  it("allows marking a past episode as watched", async () => {
    const { getDb } = await import("../db/schema");
    const { episodes } = await import("../db/schema");
    const db = getDb();
    const ep = await db.select({ id: episodes.id }).from(episodes)
      .where((await import("drizzle-orm")).eq(episodes.name, "Past Episode")).get();

    const res = await app.request(`/watched/${ep!.id}`, { method: "POST" });
    expect(res.status).toBe(200);
  });

  it("rejects marking a future episode as watched", async () => {
    const { getDb } = await import("../db/schema");
    const { episodes } = await import("../db/schema");
    const db = getDb();
    const ep = await db.select({ id: episodes.id }).from(episodes)
      .where((await import("drizzle-orm")).eq(episodes.name, "Future Episode")).get();

    const res = await app.request(`/watched/${ep!.id}`, { method: "POST" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("unreleased");
  });

  it("respects X-Timezone header when checking release status", async () => {
    const { getDb } = await import("../db/schema");
    const { episodes } = await import("../db/schema");
    const db = getDb();
    const ep = await db.select({ id: episodes.id }).from(episodes)
      .where((await import("drizzle-orm")).eq(episodes.name, "Future Episode")).get();

    // Even with a far-ahead timezone, future episode is still in the future
    const res = await app.request(`/watched/${ep!.id}`, {
      method: "POST",
      headers: { "X-Timezone": "Pacific/Auckland" },
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-numeric episodeId", async () => {
    const res = await app.request("/watched/abc", { method: "POST" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid episodeId");
  });
});

describe("DELETE /watched/:episodeId", () => {
  it("returns 400 for non-numeric episodeId", async () => {
    const res = await app.request("/watched/abc", { method: "DELETE" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid episodeId");
  });
});

describe("POST /watched/bulk", () => {
  it("returns 400 for empty episodeIds", async () => {
    const res = await app.request("/watched/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds: [], watched: true }),
    });
    expect(res.status).toBe(400);
  });

  it("only marks released episodes as watched in bulk", async () => {
    const { getDb } = await import("../db/schema");
    const { episodes } = await import("../db/schema");
    const db = getDb();
    const pastEp = await db.select({ id: episodes.id }).from(episodes)
      .where((await import("drizzle-orm")).eq(episodes.name, "Past Episode")).get();
    const futureEp = await db.select({ id: episodes.id }).from(episodes)
      .where((await import("drizzle-orm")).eq(episodes.name, "Future Episode")).get();

    const res = await app.request("/watched/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds: [futureEp!.id], watched: true }),
    });
    // Future-only batch returns 400 (no released IDs)
    expect(res.status).toBe(400);

    const res2 = await app.request("/watched/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episodeIds: [pastEp!.id], watched: true }),
    });
    expect(res2.status).toBe(200);
  });
});

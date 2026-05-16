import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import { upsertTitles, createUser, trackTitle, watchTitle } from "../db/repository";
import moviesApp from "./movies";
import type { AppEnv } from "../types";

let userId: string;

function makeAuthedApp() {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: userId, username: "testuser", name: null, role: null, is_admin: false });
    await next();
  });
  a.route("/movies", moviesApp);
  return a;
}

function makeUnauthApp() {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Session expired" }, 401);
    await next();
  });
  a.route("/movies", moviesApp);
  return a;
}

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("testuser", "hash");
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /movies/tracking", () => {
  it("returns to_watch and upcoming arrays for an authed user", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "m-rel", objectType: "MOVIE", title: "Released Movie", releaseDate: "2020-01-01" }),
      makeParsedTitle({ id: "m-upc", objectType: "MOVIE", title: "Upcoming Movie", releaseDate: "2099-06-01" }),
    ]);
    await trackTitle("m-rel", userId);
    await trackTitle("m-upc", userId);

    const app = makeAuthedApp();
    const res = await app.request("/movies/tracking");

    expect(res.status).toBe(200);
    const body = await res.json() as { to_watch: { id: string }[]; upcoming: { id: string }[] };
    expect(body.to_watch.some((m) => m.id === "m-rel")).toBe(true);
    expect(body.upcoming.some((m) => m.id === "m-upc")).toBe(true);
    expect(body.to_watch.some((m) => m.id === "m-upc")).toBe(false);
    expect(body.upcoming.some((m) => m.id === "m-rel")).toBe(false);
  });

  it("excludes movies marked watched from to_watch", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "m-watched", objectType: "MOVIE", title: "Already Watched", releaseDate: "2020-01-01" }),
    ]);
    await trackTitle("m-watched", userId);
    await watchTitle("m-watched", userId);

    const app = makeAuthedApp();
    const res = await app.request("/movies/tracking");

    expect(res.status).toBe(200);
    const body = await res.json() as { to_watch: { id: string }[] };
    expect(body.to_watch.some((m: { id: string }) => m.id === "m-watched")).toBe(false);
  });

  it("returns 401 when unauthenticated", async () => {
    const app = makeUnauthApp();
    const res = await app.request("/movies/tracking");
    expect(res.status).toBe(401);
  });
});

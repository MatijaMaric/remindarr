import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  afterAll,
  spyOn,
} from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { upsertTitles, trackTitle, createUser } from "../db/repository";
import {
  makeParsedTitle,
  makeTmdbDiscoverMovie,
  makeTmdbDiscoverTv,
  makeTmdbTrendingPerson,
} from "../test-utils/fixtures";
import * as tmdbClient from "../tmdb/client";
import { initCache } from "../cache";
import { MemoryCache } from "../cache/memory";

const trendingApp = (await import("./trending")).default;

const emptyPage = { results: [], total_pages: 1, total_results: 0, page: 1 };

let app: Hono<AppEnv>;
let spies: ReturnType<typeof spyOn>[] = [];

function authedApp(userId: string) {
  const a = new Hono<AppEnv>();
  a.use("*", async (c, next) => {
    c.set("user", {
      id: userId,
      username: "trendinguser",
      name: null,
      role: null,
      is_admin: false,
    });
    await next();
  });
  a.route("/trending", trendingApp);
  return a;
}

beforeEach(() => {
  setupTestDb();
  initCache(new MemoryCache(1000));

  app = new Hono<AppEnv>();
  app.route("/trending", trendingApp);

  spies = [
    spyOn(tmdbClient, "fetchTrendingMovies").mockResolvedValue({
      ...emptyPage,
    } as never),
    spyOn(tmdbClient, "fetchTrendingTv").mockResolvedValue({
      ...emptyPage,
    } as never),
    spyOn(tmdbClient, "fetchTrendingPeople").mockResolvedValue({
      ...emptyPage,
    } as never),
  ];
});

afterEach(() => {
  for (const s of spies) s.mockRestore();
  spies = [];
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /trending — validation", () => {
  it("rejects an invalid time_window with 400 + issues", async () => {
    const res = await app.request("/trending?time_window=bogus");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(Array.isArray(body.issues)).toBe(true);
  });

  it("accepts time_window=day and forwards it to the fetchers", async () => {
    const res = await app.request("/trending?time_window=day");
    expect(res.status).toBe(200);
    expect(tmdbClient.fetchTrendingMovies).toHaveBeenCalledWith("day");
    expect(tmdbClient.fetchTrendingTv).toHaveBeenCalledWith("day");
    expect(tmdbClient.fetchTrendingPeople).toHaveBeenCalledWith("day");
  });
});

describe("GET /trending — happy path", () => {
  it("returns 200 with movies/shows/people and calls the trending fetchers", async () => {
    (tmdbClient.fetchTrendingMovies as any).mockResolvedValueOnce({
      ...emptyPage,
      results: [makeTmdbDiscoverMovie({ id: 1 })],
    });
    (tmdbClient.fetchTrendingTv as any).mockResolvedValueOnce({
      ...emptyPage,
      results: [makeTmdbDiscoverTv({ id: 2 })],
    });
    (tmdbClient.fetchTrendingPeople as any).mockResolvedValueOnce({
      ...emptyPage,
      results: [makeTmdbTrendingPerson({ id: 3, name: "Jane Doe" })],
    });

    const res = await app.request("/trending");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.movies).toHaveLength(1);
    expect(body.shows).toHaveLength(1);
    expect(body.people).toHaveLength(1);
    expect(body.movies[0].id).toBe("movie-1");
    expect(body.movies[0].objectType).toBe("MOVIE");
    expect(body.movies[0].posterUrl).toContain("https://image.tmdb.org");
    expect(body.movies[0].isTracked).toBe(false);
    expect(body.shows[0].id).toBe("tv-2");
    expect(body.people[0].id).toBe(3);
    expect(body.people[0].name).toBe("Jane Doe");
    expect(typeof body.refreshedAt).toBe("string");

    expect(tmdbClient.fetchTrendingMovies).toHaveBeenCalledTimes(1);
    expect(tmdbClient.fetchTrendingTv).toHaveBeenCalledTimes(1);
    expect(tmdbClient.fetchTrendingPeople).toHaveBeenCalledTimes(1);
  });
});

describe("GET /trending — isTracked overlay", () => {
  it("returns isTracked=true for a tracked title when authed, false for anon", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-100" })]);
    const userId = await createUser("trendinguser", "hash");
    await trackTitle("movie-100", userId);

    (tmdbClient.fetchTrendingMovies as any).mockResolvedValue({
      ...emptyPage,
      results: [makeTmdbDiscoverMovie({ id: 100 })],
    });

    const anonRes = await app.request("/trending");
    const anonBody = await anonRes.json();
    expect(anonBody.movies[0].isTracked).toBe(false);

    // Second request (authed) hits the cache, but isTracked is overlaid per
    // request — the cached snapshot itself is user-agnostic.
    const authRes = await authedApp(userId).request("/trending");
    const authBody = await authRes.json();
    expect(authBody.movies[0].isTracked).toBe(true);
  });
});

describe("GET /trending — cache", () => {
  it("serves the second request from cache without re-calling TMDB", async () => {
    (tmdbClient.fetchTrendingMovies as any).mockResolvedValue({
      ...emptyPage,
      results: [makeTmdbDiscoverMovie({ id: 11 })],
    });

    await app.request("/trending");
    await app.request("/trending");

    expect(tmdbClient.fetchTrendingMovies).toHaveBeenCalledTimes(1);
    expect(tmdbClient.fetchTrendingTv).toHaveBeenCalledTimes(1);
    expect(tmdbClient.fetchTrendingPeople).toHaveBeenCalledTimes(1);
  });
});

describe("GET /trending — dedupe + empty groups", () => {
  it("collapses duplicate ids within a group and returns [] for empty types", async () => {
    (tmdbClient.fetchTrendingMovies as any).mockResolvedValueOnce({
      ...emptyPage,
      results: [
        makeTmdbDiscoverMovie({ id: 7 }),
        makeTmdbDiscoverMovie({ id: 7 }),
      ],
    });

    const res = await app.request("/trending");
    const body = await res.json();

    expect(body.movies).toHaveLength(1);
    expect(body.movies[0].id).toBe("movie-7");
    expect(body.shows).toEqual([]);
    expect(body.people).toEqual([]);
  });
});

describe("GET /trending — fail soft", () => {
  it("returns 200 with empty groups when TMDB rejects and the cache is cold", async () => {
    (tmdbClient.fetchTrendingMovies as any).mockRejectedValueOnce(
      new Error("TMDB unavailable"),
    );

    const res = await app.request("/trending");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.movies).toEqual([]);
    expect(body.shows).toEqual([]);
    expect(body.people).toEqual([]);
    expect(typeof body.refreshedAt).toBe("string");

    // An empty fail-soft response must NOT be edge-cached for the full TTL —
    // otherwise the section stays empty for a day after TMDB recovers.
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("sets a public edge cache for anonymous requests on the success path", async () => {
    (tmdbClient.fetchTrendingMovies as any).mockResolvedValueOnce({
      ...emptyPage,
      results: [makeTmdbDiscoverMovie({ id: 12 })],
    });
    const res = await app.request("/trending");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("public");
  });
});

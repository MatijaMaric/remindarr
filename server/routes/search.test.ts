import { describe, it, expect, beforeEach, afterEach, afterAll, spyOn } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import type { TmdbSearchMultiResult } from "../tmdb/types";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { upsertTitles, trackTitle, createUser } from "../db/repository";
import { makeParsedTitle, makeTmdbSearchMultiMovie, makeTmdbMovieDetails } from "../test-utils/fixtures";
import * as tmdbClient from "../tmdb/client";

const searchApp = (await import("./search")).default;

let app: Hono<AppEnv>;
let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  setupTestDb();

  app = new Hono<AppEnv>();
  app.route("/search", searchApp);

  spies = [
    spyOn(tmdbClient, "searchMulti").mockResolvedValue({ results: [] as TmdbSearchMultiResult[], total_pages: 1, total_results: 0, page: 1 } as any),
    spyOn(tmdbClient, "fetchMovieDetails").mockResolvedValue({} as any),
    spyOn(tmdbClient, "fetchTvDetails").mockResolvedValue({} as any),
    spyOn(tmdbClient, "getMovieGenres").mockResolvedValue(new Map([[28, "Action"]])),
    spyOn(tmdbClient, "getTvGenres").mockResolvedValue(new Map([[18, "Drama"]])),
  ];
});

afterEach(() => {
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

afterAll(() => {
  teardownTestDb();
});

describe("GET /search", () => {
  it("returns 400 when query is missing", async () => {
    const res = await app.request("/search");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("required");
  });

  it("returns search results with isTracked=false when no user", async () => {
    const movie = makeTmdbSearchMultiMovie({ id: 42 });
    (tmdbClient.searchMulti as any).mockResolvedValueOnce({
      results: [movie], total_pages: 1, total_results: 1, page: 1,
    });
    (tmdbClient.fetchMovieDetails as any).mockResolvedValueOnce(makeTmdbMovieDetails({ id: 42 }));

    const res = await app.request("/search?q=test");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.titles).toHaveLength(1);
    expect(body.titles[0].isTracked).toBe(false);
  });

  it("returns isTracked=true for tracked titles when user is authenticated", async () => {
    // Set up real DB data for tracking
    await upsertTitles([makeParsedTitle({ id: "movie-42" })]);
    const userId = await createUser("testuser", "hash");
    await trackTitle("movie-42", userId);

    const movie = makeTmdbSearchMultiMovie({ id: 42 });
    (tmdbClient.searchMulti as any).mockResolvedValueOnce({
      results: [movie], total_pages: 1, total_results: 1, page: 1,
    });
    (tmdbClient.fetchMovieDetails as any).mockResolvedValueOnce(makeTmdbMovieDetails({ id: 42 }));

    const authedApp = new Hono<AppEnv>();
    authedApp.use("/search/*", async (c, next) => {
      c.set("user", { id: userId, username: "testuser", name: null, role: null, is_admin: false });
      await next();
    });
    authedApp.route("/search", searchApp);

    const res = await authedApp.request("/search?q=test");
    const body = await res.json();

    expect(body.titles[0].isTracked).toBe(true);
  });
});

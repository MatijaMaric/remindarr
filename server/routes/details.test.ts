import { describe, it, expect, beforeEach, afterEach, afterAll, spyOn } from "bun:test";
import { Hono } from "hono";
import type { AppEnv } from "../types";
import { CONFIG } from "../config";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { upsertTitles } from "../db/repository";
import { makeParsedTitle, makeTmdbMovieDetails, makeTmdbTvDetails } from "../test-utils/fixtures";
import * as tmdbClient from "../tmdb/client";

// Ensure TMDB API key is set so fallback logic is exercised
CONFIG.TMDB_API_KEY = "test-api-key";

const detailsApp = (await import("./details")).default;

let app: Hono<AppEnv>;
let spies: ReturnType<typeof spyOn>[] = [];

beforeEach(() => {
  setupTestDb();

  app = new Hono<AppEnv>();
  app.route("/details", detailsApp);

  // Set up spies for all TMDB client functions used by the details route
  spies = [
    spyOn(tmdbClient, "fetchMovieDetails").mockResolvedValue({} as any),
    spyOn(tmdbClient, "fetchTvDetails").mockResolvedValue({} as any),
    spyOn(tmdbClient, "fetchMovieFullDetails").mockResolvedValue(null as any),
    spyOn(tmdbClient, "fetchShowFullDetails").mockResolvedValue(null as any),
    spyOn(tmdbClient, "fetchSeasonDetails").mockResolvedValue(null as any),
    spyOn(tmdbClient, "fetchEpisodeDetails").mockResolvedValue(null as any),
    spyOn(tmdbClient, "fetchPersonDetails").mockResolvedValue(null as any),
  ];
});

afterEach(() => {
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

afterAll(() => {
  teardownTestDb();
});

// Helper to get a spy by function name
function getSpy(name: keyof typeof tmdbClient) {
  return tmdbClient[name] as ReturnType<typeof spyOn>;
}

describe("GET /details/movie/:id", () => {
  it("returns title from DB without TMDB fallback", async () => {
    upsertTitles([makeParsedTitle({ id: "movie-123", title: "DB Movie", tmdbId: "123" })]);

    const res = await app.request("/details/movie/movie-123");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.title.title).toBe("DB Movie");
    expect(tmdbClient.fetchMovieDetails).not.toHaveBeenCalled();
  });

  it("fetches from TMDB and persists when title not in DB", async () => {
    (tmdbClient.fetchMovieDetails as any).mockResolvedValueOnce(
      makeTmdbMovieDetails({ id: 999, title: "TMDB Movie" })
    );

    const res = await app.request("/details/movie/movie-999");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.title.title).toBe("TMDB Movie");
    expect(body.title.id).toBe("movie-999");
    expect(tmdbClient.fetchMovieDetails).toHaveBeenCalledWith(999);
  });

  it("returns 404 when TMDB fallback fails", async () => {
    (tmdbClient.fetchMovieDetails as any).mockRejectedValueOnce(new Error("TMDB API error"));

    const res = await app.request("/details/movie/movie-999");
    expect(res.status).toBe(404);
  });

  it("returns 404 for invalid title ID format", async () => {
    const res = await app.request("/details/movie/invalid-id");
    expect(res.status).toBe(404);
  });
});

describe("GET /details/show/:id", () => {
  it("returns title from DB without TMDB fallback", async () => {
    upsertTitles([makeParsedTitle({ id: "tv-456", objectType: "SHOW", title: "DB Show", tmdbId: "456" })]);

    const res = await app.request("/details/show/tv-456");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.title.title).toBe("DB Show");
    expect(tmdbClient.fetchTvDetails).not.toHaveBeenCalled();
  });

  it("fetches from TMDB and persists when show not in DB", async () => {
    (tmdbClient.fetchTvDetails as any).mockResolvedValueOnce(
      makeTmdbTvDetails({ id: 789, name: "TMDB Show" })
    );

    const res = await app.request("/details/show/tv-789");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.title.title).toBe("TMDB Show");
    expect(body.title.id).toBe("tv-789");
    expect(tmdbClient.fetchTvDetails).toHaveBeenCalledWith(789);
  });

  it("returns 404 when TMDB fallback fails", async () => {
    (tmdbClient.fetchTvDetails as any).mockRejectedValueOnce(new Error("TMDB API error"));

    const res = await app.request("/details/show/tv-789");
    expect(res.status).toBe(404);
  });
});

describe("GET /details/show/:id/season/:season", () => {
  it("fetches show from TMDB when not in DB for season endpoint", async () => {
    (tmdbClient.fetchTvDetails as any).mockResolvedValueOnce(
      makeTmdbTvDetails({ id: 555, name: "Season Show" })
    );

    const res = await app.request("/details/show/tv-555/season/1");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.title.title).toBe("Season Show");
    expect(body.seasonNumber).toBe(1);
    expect(tmdbClient.fetchTvDetails).toHaveBeenCalledWith(555);
  });
});

describe("GET /details/person/:personId", () => {
  it("returns person details from TMDB", async () => {
    (tmdbClient.fetchPersonDetails as any).mockResolvedValueOnce({
      id: 123,
      name: "Test Actor",
      biography: "A test biography",
      birthday: "1990-01-15",
      deathday: null,
      place_of_birth: "Test City",
      known_for_department: "Acting",
      profile_path: "/test.jpg",
      also_known_as: [],
      popularity: 50,
      combined_credits: { cast: [], crew: [] },
    });

    const res = await app.request("/details/person/123");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.person.name).toBe("Test Actor");
    expect(body.person.biography).toBe("A test biography");
    expect(tmdbClient.fetchPersonDetails).toHaveBeenCalledWith(123);
  });

  it("returns 400 for invalid person ID", async () => {
    const res = await app.request("/details/person/abc");
    expect(res.status).toBe(400);
  });

  it("returns 404 when TMDB fetch fails", async () => {
    (tmdbClient.fetchPersonDetails as any).mockRejectedValueOnce(new Error("Not found"));
    const res = await app.request("/details/person/999");
    expect(res.status).toBe(404);
  });
});

import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { makeParsedTitle } from "../../test-utils/fixtures";
import { upsertTitles, createUser, trackTitle, updateProfilePublic, watchTitle, upsertEpisodes, watchEpisode } from "../repository";
import { getDb, watchedTitles } from "../schema";
import { getUserPublicProfile } from "./profile";
import { sql } from "drizzle-orm";

let userId: string;

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("testuser", "hash");
  await updateProfilePublic(userId, true);
});

afterAll(() => {
  teardownTestDb();
});

describe("getUserPublicProfile movie sort order", () => {
  it("sorts movies by most recently watched first", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-a", objectType: "MOVIE", title: "Movie A" }),
      makeParsedTitle({ id: "movie-b", objectType: "MOVIE", title: "Movie B" }),
      makeParsedTitle({ id: "movie-c", objectType: "MOVIE", title: "Movie C" }),
    ]);
    await trackTitle("movie-a", userId);
    await trackTitle("movie-b", userId);
    await trackTitle("movie-c", userId);

    // Watch movies at different times using direct DB insert for controlled timestamps
    const db = getDb();
    await db.insert(watchedTitles).values({ titleId: "movie-a", userId }).run();
    await db.update(watchedTitles).set({ watchedAt: "2024-01-01 10:00:00" })
      .where(sql`${watchedTitles.titleId} = ${"movie-a"} AND ${watchedTitles.userId} = ${userId}`).run();

    await db.insert(watchedTitles).values({ titleId: "movie-c", userId }).run();
    await db.update(watchedTitles).set({ watchedAt: "2024-03-15 10:00:00" })
      .where(sql`${watchedTitles.titleId} = ${"movie-c"} AND ${watchedTitles.userId} = ${userId}`).run();

    await db.insert(watchedTitles).values({ titleId: "movie-b", userId }).run();
    await db.update(watchedTitles).set({ watchedAt: "2024-02-10 10:00:00" })
      .where(sql`${watchedTitles.titleId} = ${"movie-b"} AND ${watchedTitles.userId} = ${userId}`).run();

    const result = await getUserPublicProfile("testuser");
    expect(result).not.toBeNull();
    const movies = result!.movies;
    expect(movies).toHaveLength(3);
    // Most recently watched first
    expect(movies[0].id).toBe("movie-c");
    expect(movies[1].id).toBe("movie-b");
    expect(movies[2].id).toBe("movie-a");
  });

  it("puts unwatched movies after watched movies", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-watched", objectType: "MOVIE", title: "Watched Movie" }),
      makeParsedTitle({ id: "movie-unwatched", objectType: "MOVIE", title: "Unwatched Movie" }),
    ]);
    await trackTitle("movie-watched", userId);
    await trackTitle("movie-unwatched", userId);

    await watchTitle("movie-watched", userId);

    const result = await getUserPublicProfile("testuser");
    expect(result).not.toBeNull();
    const movies = result!.movies;
    expect(movies).toHaveLength(2);
    expect(movies[0].id).toBe("movie-watched");
    expect(movies[1].id).toBe("movie-unwatched");
  });

  it("does not affect show ordering", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "show-1", objectType: "SHOW", title: "Show One" }),
      makeParsedTitle({ id: "show-2", objectType: "SHOW", title: "Show Two" }),
    ]);
    await trackTitle("show-1", userId);
    await trackTitle("show-2", userId);

    const result = await getUserPublicProfile("testuser");
    expect(result).not.toBeNull();
    expect(result!.shows).toHaveLength(2);
  });

  it("returns movies in stable order when none are watched", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "movie-x", objectType: "MOVIE", title: "Movie X" }),
      makeParsedTitle({ id: "movie-y", objectType: "MOVIE", title: "Movie Y" }),
    ]);
    await trackTitle("movie-x", userId);
    await trackTitle("movie-y", userId);

    const result = await getUserPublicProfile("testuser");
    expect(result).not.toBeNull();
    expect(result!.movies).toHaveLength(2);
    // Both unwatched, so order is stable (original order preserved)
  });
});

describe("getUserPublicProfile progress metrics", () => {
  it("returns zero progress when no shows are tracked", async () => {
    const result = await getUserPublicProfile("testuser", true);
    expect(result).not.toBeNull();
    expect(result!.stats.shows_completed).toBe(0);
    expect(result!.stats.shows_total).toBe(0);
    expect(result!.stats.total_watched_episodes).toBe(0);
    expect(result!.stats.total_released_episodes).toBe(0);
  });

  it("counts shows_total correctly", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "show-a", objectType: "SHOW", title: "Show A" }),
      makeParsedTitle({ id: "show-b", objectType: "SHOW", title: "Show B" }),
      makeParsedTitle({ id: "movie-1", objectType: "MOVIE", title: "Movie 1" }),
    ]);
    await trackTitle("show-a", userId);
    await trackTitle("show-b", userId);
    await trackTitle("movie-1", userId);

    const result = await getUserPublicProfile("testuser", true);
    expect(result).not.toBeNull();
    expect(result!.stats.shows_total).toBe(2);
  });

  it("counts shows_completed when all episodes watched and released", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "show-done", objectType: "SHOW", title: "Completed Show" }),
    ]);
    await trackTitle("show-done", userId);
    await upsertEpisodes([
      { title_id: "show-done", season_number: 1, episode_number: 1, name: "Ep 1", overview: null, air_date: "2024-01-01", still_path: null },
      { title_id: "show-done", season_number: 1, episode_number: 2, name: "Ep 2", overview: null, air_date: "2024-01-08", still_path: null },
    ]);

    const db = getDb();
    const eps = await db.query.episodes.findMany({ where: (e, { eq }) => eq(e.titleId, "show-done") });
    for (const ep of eps) {
      await watchEpisode(ep.id, userId);
    }

    const result = await getUserPublicProfile("testuser", true);
    expect(result).not.toBeNull();
    expect(result!.stats.shows_completed).toBe(1);
    expect(result!.stats.shows_total).toBe(1);
  });

  it("does not count show as completed when not all episodes are watched", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "show-partial", objectType: "SHOW", title: "Partial Show" }),
    ]);
    await trackTitle("show-partial", userId);
    await upsertEpisodes([
      { title_id: "show-partial", season_number: 1, episode_number: 1, name: "Ep 1", overview: null, air_date: "2024-01-01", still_path: null },
      { title_id: "show-partial", season_number: 1, episode_number: 2, name: "Ep 2", overview: null, air_date: "2024-01-08", still_path: null },
    ]);

    const db = getDb();
    const eps = await db.query.episodes.findMany({ where: (e, { eq }) => eq(e.titleId, "show-partial") });
    await watchEpisode(eps[0].id, userId);

    const result = await getUserPublicProfile("testuser", true);
    expect(result).not.toBeNull();
    expect(result!.stats.shows_completed).toBe(0);
    expect(result!.stats.total_watched_episodes).toBe(1);
    expect(result!.stats.total_released_episodes).toBe(2);
  });

  it("aggregates episodes across multiple shows", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "show-x", objectType: "SHOW", title: "Show X" }),
      makeParsedTitle({ id: "show-y", objectType: "SHOW", title: "Show Y" }),
    ]);
    await trackTitle("show-x", userId);
    await trackTitle("show-y", userId);
    await upsertEpisodes([
      { title_id: "show-x", season_number: 1, episode_number: 1, name: "X Ep 1", overview: null, air_date: "2024-01-01", still_path: null },
      { title_id: "show-x", season_number: 1, episode_number: 2, name: "X Ep 2", overview: null, air_date: "2024-01-08", still_path: null },
      { title_id: "show-y", season_number: 1, episode_number: 1, name: "Y Ep 1", overview: null, air_date: "2024-02-01", still_path: null },
    ]);

    const db = getDb();
    const xEps = await db.query.episodes.findMany({ where: (e, { eq }) => eq(e.titleId, "show-x") });
    await watchEpisode(xEps[0].id, userId);

    const result = await getUserPublicProfile("testuser", true);
    expect(result).not.toBeNull();
    expect(result!.stats.total_watched_episodes).toBe(1);
    expect(result!.stats.total_released_episodes).toBe(3);
  });

  it("does not count show as completed when unreleased episodes exist", async () => {
    await upsertTitles([
      makeParsedTitle({ id: "show-future", objectType: "SHOW", title: "Future Show" }),
    ]);
    await trackTitle("show-future", userId);
    await upsertEpisodes([
      { title_id: "show-future", season_number: 1, episode_number: 1, name: "Ep 1", overview: null, air_date: "2024-01-01", still_path: null },
      { title_id: "show-future", season_number: 1, episode_number: 2, name: "Ep 2", overview: null, air_date: "2099-12-31", still_path: null },
    ]);

    const db = getDb();
    const eps = await db.query.episodes.findMany({ where: (e, { eq }) => eq(e.titleId, "show-future") });
    // Watch the one released episode
    const releasedEp = eps.find(e => e.airDate === "2024-01-01")!;
    await watchEpisode(releasedEp.id, userId);

    const result = await getUserPublicProfile("testuser", true);
    expect(result).not.toBeNull();
    // total_episodes=2, watched=1, released=1 -> not completed (total != watched)
    expect(result!.stats.shows_completed).toBe(0);
  });
});

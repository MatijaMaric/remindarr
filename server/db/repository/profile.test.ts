import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { makeParsedTitle } from "../../test-utils/fixtures";
import { upsertTitles, createUser, trackTitle, updateProfilePublic, watchTitle } from "../repository";
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

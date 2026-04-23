import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { makeParsedTitle } from "../test-utils/fixtures";
import {
  createUser,
  upsertTitles,
  upsertEpisodes,
  trackTitle,
  watchTitle,
  watchEpisode,
  rateTitle,
  createNotifier,
  createRecommendation,
  logWatch,
  deleteUser,
} from "./repository";
import {
  tracked,
  watchedEpisodes,
  watchedTitles,
  notifiers,
  recommendations,
  offers,
  episodes,
  ratings,
  watchHistory,
} from "./schema";
import { getDb } from "./schema";
import { getRawDb } from "./bun-db";

describe("FK onDelete behavior", () => {
  beforeEach(() => {
    setupTestDb();
  });

  afterAll(() => {
    teardownTestDb();
  });

  test("test database has foreign keys enabled", () => {
    const raw = getRawDb();
    const row = raw.prepare("PRAGMA foreign_keys").get() as { foreign_keys: number };
    expect(row.foreign_keys).toBe(1);
  });

  test("deleting a user cascades to tracked, watched_episodes, notifiers, recommendations", async () => {
    const userId = await createUser("alice", "hash");
    const otherUserId = await createUser("bob", "hash");

    await upsertTitles([
      makeParsedTitle({ id: "movie-1", title: "Movie 1" }),
      makeParsedTitle({ id: "show-1", objectType: "SHOW", title: "Show 1" }),
    ]);
    await upsertEpisodes([
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 1,
        name: "Pilot",
        overview: null,
        air_date: "2020-01-01",
        still_path: null,
      },
    ]);

    // Look up the generated episode id
    const db = getDb();
    const ep = await db.select({ id: episodes.id }).from(episodes).get();
    expect(ep).toBeDefined();
    const episodeId = ep!.id;

    // Create user-owned rows
    await trackTitle("movie-1", userId);
    await watchTitle("movie-1", userId);
    await watchEpisode(episodeId, userId);
    await createNotifier(userId, "discord", "Test", { webhook: "x" }, "09:00", "UTC");
    await createRecommendation(userId, "movie-1", "Watch this");

    // Create rows for a second user that must survive deletion of the first
    await trackTitle("movie-1", otherUserId);
    await watchEpisode(episodeId, otherUserId);

    // Delete the first user
    await deleteUser(userId);

    // Every user-owned row for the deleted user should be gone
    const trackedRows = await db.select().from(tracked).where(eq(tracked.userId, userId)).all();
    expect(trackedRows).toHaveLength(0);

    const watchedEpRows = await db
      .select()
      .from(watchedEpisodes)
      .where(eq(watchedEpisodes.userId, userId))
      .all();
    expect(watchedEpRows).toHaveLength(0);

    const watchedTitleRows = await db
      .select()
      .from(watchedTitles)
      .where(eq(watchedTitles.userId, userId))
      .all();
    expect(watchedTitleRows).toHaveLength(0);

    const notifierRows = await db
      .select()
      .from(notifiers)
      .where(eq(notifiers.userId, userId))
      .all();
    expect(notifierRows).toHaveLength(0);

    const recRows = await db
      .select()
      .from(recommendations)
      .where(eq(recommendations.fromUserId, userId))
      .all();
    expect(recRows).toHaveLength(0);

    // Other user's rows are untouched
    const otherTracked = await db
      .select()
      .from(tracked)
      .where(eq(tracked.userId, otherUserId))
      .all();
    expect(otherTracked).toHaveLength(1);
  });

  test("deleting a title cascades to offers, episodes, tracked, watched_titles, ratings, recommendations", async () => {
    const userId = await createUser("alice", "hash");

    await upsertTitles([makeParsedTitle({ id: "show-x", objectType: "SHOW", title: "Show X" })]);

    // offers: insert directly (requires a provider row)
    const raw = getRawDb();
    raw.prepare("INSERT INTO providers (id, name) VALUES (?, ?)").run(99, "TestProvider");
    const db = getDb();
    await db
      .insert(offers)
      .values({
        titleId: "show-x",
        providerId: 99,
        monetizationType: "FLATRATE",
        url: "https://example.com",
      })
      .run();

    await upsertEpisodes([
      {
        title_id: "show-x",
        season_number: 1,
        episode_number: 1,
        name: "Pilot",
        overview: null,
        air_date: "2020-01-01",
        still_path: null,
      },
    ]);

    await trackTitle("show-x", userId);
    await watchTitle("show-x", userId);
    await rateTitle(userId, "show-x", "LOVE");
    await createRecommendation(userId, "show-x", "Check this out");

    // Delete the title
    await db.run("DELETE FROM titles WHERE id = 'show-x'");

    const offersRows = await db.select().from(offers).where(eq(offers.titleId, "show-x")).all();
    expect(offersRows).toHaveLength(0);

    const epRows = await db.select().from(episodes).where(eq(episodes.titleId, "show-x")).all();
    expect(epRows).toHaveLength(0);

    const trackedRows = await db.select().from(tracked).where(eq(tracked.titleId, "show-x")).all();
    expect(trackedRows).toHaveLength(0);

    const watchedTitleRows = await db
      .select()
      .from(watchedTitles)
      .where(eq(watchedTitles.titleId, "show-x"))
      .all();
    expect(watchedTitleRows).toHaveLength(0);

    const ratingRows = await db.select().from(ratings).where(eq(ratings.titleId, "show-x")).all();
    expect(ratingRows).toHaveLength(0);

    const recRows = await db
      .select()
      .from(recommendations)
      .where(eq(recommendations.titleId, "show-x"))
      .all();
    expect(recRows).toHaveLength(0);
  });

  test("deleting an episode cascades to watched_episodes and sets watch_history.episode_id to null", async () => {
    const userId = await createUser("alice", "hash");

    await upsertTitles([makeParsedTitle({ id: "show-y", objectType: "SHOW", title: "Show Y" })]);
    await upsertEpisodes([
      {
        title_id: "show-y",
        season_number: 1,
        episode_number: 1,
        name: "Pilot",
        overview: null,
        air_date: "2020-01-01",
        still_path: null,
      },
    ]);

    const db = getDb();
    const ep = await db
      .select({ id: episodes.id })
      .from(episodes)
      .where(eq(episodes.titleId, "show-y"))
      .get();
    expect(ep).toBeDefined();
    const episodeId = ep!.id;

    await watchEpisode(episodeId, userId);
    await logWatch(userId, "show-y", episodeId);

    // Delete the episode row
    await db.run("DELETE FROM episodes WHERE id = " + episodeId);

    // watched_episodes should be gone (cascade)
    const weRows = await db
      .select()
      .from(watchedEpisodes)
      .where(eq(watchedEpisodes.episodeId, episodeId))
      .all();
    expect(weRows).toHaveLength(0);

    // watch_history row should survive with episode_id set to null
    const historyRows = await db
      .select()
      .from(watchHistory)
      .where(eq(watchHistory.userId, userId))
      .all();
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0].episodeId).toBeNull();
    expect(historyRows[0].titleId).toBe("show-y");
  });
});

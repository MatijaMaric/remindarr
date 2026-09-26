import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { makeParsedTitle } from "../../test-utils/fixtures";
import {
  upsertTitles,
  createUser,
  trackTitle,
  upsertEpisodes,
  watchEpisode,
  watchEpisodesBulk,
} from "../repository";
import {
  getUnwatchedEpisodes,
  getUnwatchedEpisodesWithMeta,
  getNextUnwatchedEpisodesForTitles,
  MAX_UNWATCHED_PER_TITLE,
} from "./episodes";
import { getRawDb } from "../bun-db";

let userId: string;

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("testuser", "hash");
  await upsertTitles([
    makeParsedTitle({ id: "show-1", objectType: "SHOW", title: "Test Show" }),
  ]);
  await trackTitle("show-1", userId);
});

afterAll(() => {
  teardownTestDb();
});

describe("getUnwatchedEpisodes", () => {
  it("includes episodes that aired today", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await upsertEpisodes([
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 1,
        name: "Today Episode",
        overview: null,
        air_date: today,
        still_path: null,
      },
    ]);

    const results = await getUnwatchedEpisodes(userId);
    expect(results.some((e) => e.air_date === today)).toBe(true);
  });

  it("excludes future episodes", async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await upsertEpisodes([
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 2,
        name: "Future Episode",
        overview: null,
        air_date: tomorrow,
        still_path: null,
      },
    ]);

    const results = await getUnwatchedEpisodes(userId);
    expect(results.some((e) => e.air_date === tomorrow)).toBe(false);
  });

  it("excludes episodes already watched", async () => {
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .slice(0, 10);
    await upsertEpisodes([
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 3,
        name: "Watched Episode",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
    ]);

    const [episode] = await getUnwatchedEpisodes(userId);
    await watchEpisode(episode.id, userId);

    const after = await getUnwatchedEpisodes(userId);
    expect(after.some((e) => e.id === episode.id)).toBe(false);
  });

  it("orders title-groups by most recent watched_at descending, with never-watched titles last (alphabetical fallback)", async () => {
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .slice(0, 10);
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000)
      .toISOString()
      .slice(0, 10);

    await upsertTitles([
      makeParsedTitle({ id: "show-2", objectType: "SHOW", title: "B Show" }),
      makeParsedTitle({
        id: "show-3",
        objectType: "SHOW",
        title: "A Never Watched Show",
      }),
    ]);
    await trackTitle("show-2", userId);
    await trackTitle("show-3", userId);

    await upsertEpisodes([
      // show-1 (Test Show): two unwatched + one we'll mark watched at the EARLIER time
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 1,
        name: "S1 E1",
        overview: null,
        air_date: twoDaysAgo,
        still_path: null,
      },
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 2,
        name: "S1 E2",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 3,
        name: "S1 E3 (will be watched)",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
      // show-2 (B Show): two unwatched + one we'll mark watched at the LATER time
      {
        title_id: "show-2",
        season_number: 1,
        episode_number: 1,
        name: "B S1 E1",
        overview: null,
        air_date: twoDaysAgo,
        still_path: null,
      },
      {
        title_id: "show-2",
        season_number: 1,
        episode_number: 2,
        name: "B S1 E2",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
      {
        title_id: "show-2",
        season_number: 1,
        episode_number: 3,
        name: "B S1 E3 (will be watched)",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
      // show-3 (never watched): two unwatched
      {
        title_id: "show-3",
        season_number: 1,
        episode_number: 1,
        name: "A S1 E1",
        overview: null,
        air_date: twoDaysAgo,
        still_path: null,
      },
      {
        title_id: "show-3",
        season_number: 1,
        episode_number: 2,
        name: "A S1 E2",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
    ]);

    const all = await getUnwatchedEpisodes(userId);
    const show1Watched = all.find(
      (e) => e.title_id === "show-1" && e.episode_number === 3,
    )!;
    const show2Watched = all.find(
      (e) => e.title_id === "show-2" && e.episode_number === 3,
    )!;

    // show-2 watched 1 hour after show-1 → show-2 should sort first by recency.
    await watchEpisodesBulk(
      [show1Watched.id, show2Watched.id],
      userId,
      new Map([
        [show1Watched.id, "2024-01-01 12:00:00"],
        [show2Watched.id, "2024-01-01 13:00:00"],
      ]),
    );

    const results = await getUnwatchedEpisodes(userId);
    const titleOrder: string[] = [];
    for (const ep of results) {
      if (titleOrder[titleOrder.length - 1] !== ep.title_id)
        titleOrder.push(ep.title_id);
    }

    // show-2 first (most recently watched), then show-1, then show-3 (never watched, alphabetical fallback by title)
    expect(titleOrder).toEqual(["show-2", "show-1", "show-3"]);

    // Within each group, episodes preserve season/episode ascending order
    const show1Episodes = results.filter((e) => e.title_id === "show-1");
    expect(show1Episodes.map((e) => e.episode_number)).toEqual([1, 2]);
    const show2Episodes = results.filter((e) => e.title_id === "show-2");
    expect(show2Episodes.map((e) => e.episode_number)).toEqual([1, 2]);
    const show3Episodes = results.filter((e) => e.title_id === "show-3");
    expect(show3Episodes.map((e) => e.episode_number)).toEqual([1, 2]);
  });
});

describe("getUnwatchedEpisodesWithMeta", () => {
  it("returns the same episodes as getUnwatchedEpisodes and includes a lastWatchedByTitle map", async () => {
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .slice(0, 10);
    await upsertEpisodes([
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 1,
        name: "Ep1",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 2,
        name: "Ep2",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
    ]);

    // Watch ep1 so lastWatchedByTitle is populated
    const db = getRawDb();
    const ep1 = db
      .prepare(
        "SELECT id FROM episodes WHERE title_id='show-1' AND episode_number=1",
      )
      .get() as { id: number };
    await watchEpisode(ep1.id, userId);

    const plain = await getUnwatchedEpisodes(userId);
    const { episodes: withMetaEps, lastWatchedByTitle } =
      await getUnwatchedEpisodesWithMeta(userId);

    // Episode results must match
    expect(withMetaEps.map((e) => e.id)).toEqual(plain.map((e) => e.id));

    // lastWatchedByTitle must contain show-1 with a valid Date
    expect(lastWatchedByTitle.has("show-1")).toBe(true);
    expect(lastWatchedByTitle.get("show-1")).toBeInstanceOf(Date);
  });

  it("returns an empty lastWatchedByTitle map when nothing has been watched", async () => {
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .slice(0, 10);
    await upsertEpisodes([
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 1,
        name: "Ep1",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
    ]);

    const { lastWatchedByTitle } = await getUnwatchedEpisodesWithMeta(userId);
    expect(lastWatchedByTitle.size).toBe(0);
  });

  it("keeps full-show counts when episodes are watched and not yet aired", async () => {
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await upsertEpisodes([
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 1,
        name: "Aired",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 2,
        name: "Aired too",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 3,
        name: "Watched",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 4,
        name: "Future",
        overview: null,
        air_date: tomorrow,
        still_path: null,
      },
    ]);

    const before = await getUnwatchedEpisodes(userId);
    const watched = before.find((e) => e.episode_number === 3)!;
    await watchEpisode(watched.id, userId);

    const results = await getUnwatchedEpisodes(userId);
    expect(results.map((e) => e.episode_number)).toEqual([1, 2]);
    for (const row of results) {
      expect(row.total_episodes).toBe(3);
      expect(row.watched_episodes_count).toBe(1);
      expect("unwatched_count" in row).toBe(false);
    }
  });

  it("returns at most MAX_UNWATCHED_PER_TITLE episodes per show, earliest first, with full counts", async () => {
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .slice(0, 10);
    const airedCount = MAX_UNWATCHED_PER_TITLE + 5;

    const db = getRawDb();
    const insert = db.prepare(
      `INSERT INTO episodes (title_id, season_number, episode_number, name, air_date)
       VALUES (?, 1, ?, ?, ?)`,
    );
    const insertAll = db.transaction(() => {
      for (let n = 1; n <= airedCount; n++) {
        insert.run("show-1", n, `E${n}`, yesterday);
      }
    });
    insertAll();

    const last = db
      .prepare(
        `SELECT id FROM episodes WHERE title_id = ? AND episode_number = ?`,
      )
      .get("show-1", airedCount) as { id: number };
    await watchEpisode(last.id, userId);

    await upsertTitles([
      makeParsedTitle({
        id: "show-aaa",
        objectType: "SHOW",
        title: "AAA Show",
      }),
    ]);
    await trackTitle("show-aaa", userId);
    await upsertEpisodes([
      {
        title_id: "show-aaa",
        season_number: 1,
        episode_number: 1,
        name: "A1",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
      {
        title_id: "show-aaa",
        season_number: 1,
        episode_number: 2,
        name: "A2",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
    ]);

    const { episodes: results } = await getUnwatchedEpisodesWithMeta(userId);
    const show1 = results.filter((e) => e.title_id === "show-1");
    const showAaa = results.filter((e) => e.title_id === "show-aaa");

    expect(show1).toHaveLength(MAX_UNWATCHED_PER_TITLE);
    expect(show1.map((e) => e.episode_number)).toEqual(
      Array.from({ length: MAX_UNWATCHED_PER_TITLE }, (_, i) => i + 1),
    );
    for (const row of show1) {
      expect(row.total_episodes).toBe(airedCount);
      expect(row.watched_episodes_count).toBe(1);
      expect(row.unwatched_count).toBe(airedCount - 1);
    }

    expect(showAaa.map((e) => e.episode_number)).toEqual([1, 2]);

    const titleOrder: string[] = [];
    for (const ep of results) {
      if (titleOrder[titleOrder.length - 1] !== ep.title_id)
        titleOrder.push(ep.title_id);
    }
    // show-1 has a watch, so it sorts ahead of the never-watched show.
    expect(titleOrder).toEqual(["show-1", "show-aaa"]);
  });

  it("limits titles to the most recently watched shows", async () => {
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .slice(0, 10);
    await upsertTitles([
      makeParsedTitle({
        id: "show-zzz",
        objectType: "SHOW",
        title: "ZZZ Show",
      }),
    ]);
    await trackTitle("show-zzz", userId);
    await upsertEpisodes([
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 1,
        name: "Unwatched",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 2,
        name: "Watched",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
      {
        title_id: "show-zzz",
        season_number: 1,
        episode_number: 1,
        name: "Z1",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
      {
        title_id: "show-zzz",
        season_number: 1,
        episode_number: 2,
        name: "Z2",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
    ]);

    const db = getRawDb();
    const watched = db
      .prepare(
        `SELECT id FROM episodes WHERE title_id = 'show-zzz' AND episode_number = 2`,
      )
      .get() as { id: number };
    await watchEpisode(watched.id, userId);
    await db
      .prepare(
        `UPDATE watched_episodes SET watched_at = ? WHERE episode_id = ?`,
      )
      .run("2024-06-01 12:00:00", watched.id);

    const { episodes: results } = await getUnwatchedEpisodesWithMeta(
      userId,
      "UTC",
      { limit: 1 },
    );
    expect(results.map((e) => e.title_id)).toEqual(["show-zzz"]);
    expect(results.map((e) => e.episode_number)).toEqual([1]);
    expect(results[0].unwatched_count).toBe(1);
    expect(results[0].watched_episodes_count).toBe(1);
    expect(results[0].total_episodes).toBe(2);
  });
});

describe("getNextUnwatchedEpisodesForTitles", () => {
  it("returns empty map when given an empty titleIds array", async () => {
    const result = await getNextUnwatchedEpisodesForTitles(userId, [], "UTC");
    expect(result.size).toBe(0);
  });

  it("returns the correct next unwatched episode for each show", async () => {
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .slice(0, 10);
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000)
      .toISOString()
      .slice(0, 10);

    // show-1: 3 episodes, first one already watched → next should be ep 2
    await upsertEpisodes([
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 1,
        name: "S1E1 Watched",
        overview: null,
        air_date: twoDaysAgo,
        still_path: null,
      },
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 2,
        name: "S1E2 Next",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 3,
        name: "S1E3 Later",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
    ]);

    // show-2 (needs to be created + tracked)
    await upsertTitles([
      makeParsedTitle({
        id: "show-next-2",
        objectType: "SHOW",
        title: "Next Show 2",
      }),
    ]);
    await trackTitle("show-next-2", userId);
    await upsertEpisodes([
      {
        title_id: "show-next-2",
        season_number: 1,
        episode_number: 1,
        name: "B-S1E1 Watched",
        overview: null,
        air_date: twoDaysAgo,
        still_path: null,
      },
      {
        title_id: "show-next-2",
        season_number: 1,
        episode_number: 2,
        name: "B-S1E2 Next",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
    ]);

    // Watch first episodes of both shows
    const db = getRawDb();
    const ep1Show1 = db
      .prepare(
        "SELECT id FROM episodes WHERE title_id='show-1' AND season_number=1 AND episode_number=1",
      )
      .get() as { id: number };
    const ep1Show2 = db
      .prepare(
        "SELECT id FROM episodes WHERE title_id='show-next-2' AND season_number=1 AND episode_number=1",
      )
      .get() as { id: number };
    await watchEpisode(ep1Show1.id, userId);
    await watchEpisode(ep1Show2.id, userId);

    const result = await getNextUnwatchedEpisodesForTitles(
      userId,
      ["show-1", "show-next-2"],
      "UTC",
    );

    expect(result.size).toBe(2);

    const show1Next = result.get("show-1");
    expect(show1Next).toBeDefined();
    expect(show1Next!.episode_number).toBe(2);
    expect(show1Next!.season_number).toBe(1);

    const show2Next = result.get("show-next-2");
    expect(show2Next).toBeDefined();
    expect(show2Next!.episode_number).toBe(2);
    expect(show2Next!.season_number).toBe(1);
  });

  it("omits a title when all its episodes are watched", async () => {
    const yesterday = new Date(Date.now() - 86400000)
      .toISOString()
      .slice(0, 10);
    await upsertEpisodes([
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 1,
        name: "Only Episode",
        overview: null,
        air_date: yesterday,
        still_path: null,
      },
    ]);

    const db = getRawDb();
    const ep = db
      .prepare(
        "SELECT id FROM episodes WHERE title_id='show-1' AND season_number=1 AND episode_number=1",
      )
      .get() as { id: number };
    await watchEpisode(ep.id, userId);

    const result = await getNextUnwatchedEpisodesForTitles(
      userId,
      ["show-1"],
      "UTC",
    );
    expect(result.has("show-1")).toBe(false);
  });

  it("omits a title when it has no aired episodes", async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await upsertEpisodes([
      {
        title_id: "show-1",
        season_number: 1,
        episode_number: 1,
        name: "Future Ep",
        overview: null,
        air_date: tomorrow,
        still_path: null,
      },
    ]);

    const result = await getNextUnwatchedEpisodesForTitles(
      userId,
      ["show-1"],
      "UTC",
    );
    expect(result.has("show-1")).toBe(false);
  });
});

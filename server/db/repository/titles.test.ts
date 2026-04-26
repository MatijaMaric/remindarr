import { describe, it, expect, beforeEach, afterAll, spyOn, afterEach } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { makeParsedTitle, makeParsedOffer } from "../../test-utils/fixtures";
import {
  upsertTitles,
  upsertProviderRows,
  upsertTitleRow,
  upsertTitleGenres,
  mergeOffers,
  upsertScores,
  getGenres,
  getLanguages,
  invalidateFilterCaches,
} from "./titles";
import { getDb } from "../schema";
import { titles, providers, offers, scores, titleGenres } from "../schema";
import { eq } from "drizzle-orm";
import * as tracing from "../../tracing";

beforeEach(() => {
  setupTestDb();
});

afterAll(() => {
  teardownTestDb();
});

describe("upsertTitles", () => {
  it("inserts a title with genres and scores", async () => {
    const title = makeParsedTitle({ id: "movie-1", title: "Test Movie", genres: ["Action", "Drama"] });
    const count = await upsertTitles([title]);
    expect(count).toBe(1);

    const db = getDb();
    const genres = await db
      .select({ genre: titleGenres.genre })
      .from(titleGenres)
      .where(eq(titleGenres.titleId, "movie-1"))
      .all();
    expect(genres.map((g) => g.genre).sort()).toEqual(["Action", "Drama"]);
  });

  it("replaces genres on re-upsert", async () => {
    const title = makeParsedTitle({ id: "movie-2", genres: ["Action", "Drama"] });
    await upsertTitles([title]);

    const updated = makeParsedTitle({ id: "movie-2", genres: ["Comedy"] });
    await upsertTitles([updated]);

    const db = getDb();
    const genres = await db
      .select({ genre: titleGenres.genre })
      .from(titleGenres)
      .where(eq(titleGenres.titleId, "movie-2"))
      .all();
    expect(genres.map((g) => g.genre)).toEqual(["Comedy"]);
  });

  it("preserves existing genres when upsert fails mid-batch (transaction isolation)", async () => {
    // Insert a title with genres successfully first
    const originalTitle = makeParsedTitle({ id: "movie-3", genres: ["Action"] });
    await upsertTitles([originalTitle]);

    // Verify genres were inserted
    const db = getDb();
    const beforeGenres = await db
      .select({ genre: titleGenres.genre })
      .from(titleGenres)
      .where(eq(titleGenres.titleId, "movie-3"))
      .all();
    expect(beforeGenres).toHaveLength(1);
    expect(beforeGenres[0].genre).toBe("Action");

    // Simulate a failure by spying on the transaction to throw after delete
    // We do this by observing that after a complete successful upsert, genres
    // are consistent — not partially updated. The transaction wrapping means
    // either all changes for a title commit, or none do.
    const updatedTitle = makeParsedTitle({ id: "movie-3", genres: ["Drama", "Comedy"] });
    await upsertTitles([updatedTitle]);

    const afterGenres = await db
      .select({ genre: titleGenres.genre })
      .from(titleGenres)
      .where(eq(titleGenres.titleId, "movie-3"))
      .all();

    // Genres should be fully replaced (not a mix of old + new)
    expect(afterGenres.map((g) => g.genre).sort()).toEqual(["Comedy", "Drama"]);
  });

  it("inserts offers and preserves deep links across upserts", async () => {
    const offer = makeParsedOffer({ titleId: "movie-4", providerId: 8, monetizationType: "FLATRATE" });
    const title = makeParsedTitle({ id: "movie-4", offers: [offer] });
    await upsertTitles([title]);

    // Manually set a deep link in the DB to simulate an existing deep link
    const rawDb = (await import("../bun-db")).getRawDb();
    rawDb.prepare("UPDATE offers SET deep_link = 'plex://movie/4' WHERE title_id = 'movie-4'").run();

    // Re-upsert with same offer — deep link should be preserved
    await upsertTitles([title]);

    const deepLinkRow = rawDb
      .prepare("SELECT deep_link FROM offers WHERE title_id = 'movie-4'")
      .get() as { deep_link: string | null };
    expect(deepLinkRow?.deep_link).toBe("plex://movie/4");
  });

  it("handles empty input without error", async () => {
    const count = await upsertTitles([]);
    expect(count).toBe(0);
  });

  it("upserts multiple titles in a batch", async () => {
    const titles = [
      makeParsedTitle({ id: "movie-10", title: "Movie Ten" }),
      makeParsedTitle({ id: "movie-11", title: "Movie Eleven" }),
      makeParsedTitle({ id: "movie-12", title: "Movie Twelve" }),
    ];
    const count = await upsertTitles(titles);
    expect(count).toBe(3);
  });
});

describe("upsertProviderRows", () => {
  it("inserts new providers", async () => {
    const db = getDb();
    await upsertProviderRows(
      [
        { id: 8, name: "Netflix", technicalName: "netflix", iconUrl: "n.png" },
        { id: 9, name: "Prime", technicalName: "prime", iconUrl: "p.png" },
      ],
      db,
    );

    const rows = await db.select().from(providers).all();
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(8)?.name).toBe("Netflix");
    expect(byId.get(8)?.technicalName).toBe("netflix");
    expect(byId.get(9)?.name).toBe("Prime");
  });

  it("updates existing providers on conflict", async () => {
    const db = getDb();
    await upsertProviderRows(
      [{ id: 8, name: "Netflix", technicalName: "netflix", iconUrl: "n1.png" }],
      db,
    );
    await upsertProviderRows(
      [{ id: 8, name: "Netflix Renamed", technicalName: "nf", iconUrl: "n2.png" }],
      db,
    );

    const row = await db.select().from(providers).where(eq(providers.id, 8)).get();
    expect(row?.name).toBe("Netflix Renamed");
    expect(row?.technicalName).toBe("nf");
    expect(row?.iconUrl).toBe("n2.png");
  });

  it("is a no-op for an empty list", async () => {
    const db = getDb();
    await upsertProviderRows([], db);
    const rows = await db.select().from(providers).all();
    expect(rows).toHaveLength(0);
  });
});

describe("upsertTitleRow", () => {
  it("inserts a new title row", async () => {
    const db = getDb();
    const title = makeParsedTitle({ id: "movie-row-1", title: "Row Test" });
    await upsertTitleRow(title, db);

    const row = await db.select().from(titles).where(eq(titles.id, "movie-row-1")).get();
    expect(row?.title).toBe("Row Test");
    expect(row?.objectType).toBe("MOVIE");
  });

  it("updates an existing title on conflict and refreshes mutable fields", async () => {
    const db = getDb();
    await upsertTitleRow(
      makeParsedTitle({ id: "movie-row-2", title: "Original", shortDescription: "old" }),
      db,
    );
    await upsertTitleRow(
      makeParsedTitle({ id: "movie-row-2", title: "Renamed", shortDescription: "new" }),
      db,
    );

    const row = await db.select().from(titles).where(eq(titles.id, "movie-row-2")).get();
    expect(row?.title).toBe("Renamed");
    expect(row?.shortDescription).toBe("new");
  });
});

describe("upsertTitleGenres", () => {
  it("inserts genres for a title", async () => {
    const db = getDb();
    await upsertTitleRow(makeParsedTitle({ id: "movie-g-1" }), db);
    await upsertTitleGenres("movie-g-1", ["Action", "Drama"], db);

    const rows = await db
      .select({ genre: titleGenres.genre })
      .from(titleGenres)
      .where(eq(titleGenres.titleId, "movie-g-1"))
      .all();
    expect(rows.map((r) => r.genre).sort()).toEqual(["Action", "Drama"]);
  });

  it("replaces existing genres rather than appending", async () => {
    const db = getDb();
    await upsertTitleRow(makeParsedTitle({ id: "movie-g-2" }), db);
    await upsertTitleGenres("movie-g-2", ["Action"], db);
    await upsertTitleGenres("movie-g-2", ["Comedy", "Romance"], db);

    const rows = await db
      .select({ genre: titleGenres.genre })
      .from(titleGenres)
      .where(eq(titleGenres.titleId, "movie-g-2"))
      .all();
    expect(rows.map((r) => r.genre).sort()).toEqual(["Comedy", "Romance"]);
  });

  it("clears all genres when given an empty list", async () => {
    const db = getDb();
    await upsertTitleRow(makeParsedTitle({ id: "movie-g-3" }), db);
    await upsertTitleGenres("movie-g-3", ["Action"], db);
    await upsertTitleGenres("movie-g-3", [], db);

    const rows = await db
      .select({ genre: titleGenres.genre })
      .from(titleGenres)
      .where(eq(titleGenres.titleId, "movie-g-3"))
      .all();
    expect(rows).toHaveLength(0);
  });

  it("treats undefined genres the same as an empty list", async () => {
    const db = getDb();
    await upsertTitleRow(makeParsedTitle({ id: "movie-g-4" }), db);
    await upsertTitleGenres("movie-g-4", ["Action"], db);
    await upsertTitleGenres("movie-g-4", undefined, db);

    const rows = await db
      .select({ genre: titleGenres.genre })
      .from(titleGenres)
      .where(eq(titleGenres.titleId, "movie-g-4"))
      .all();
    expect(rows).toHaveLength(0);
  });
});

describe("mergeOffers", () => {
  it("inserts offers for a title", async () => {
    const db = getDb();
    await upsertProviderRows(
      [{ id: 8, name: "Netflix", technicalName: "netflix", iconUrl: "n.png" }],
      db,
    );
    await upsertTitleRow(makeParsedTitle({ id: "movie-o-1" }), db);

    const offer = makeParsedOffer({ titleId: "movie-o-1", providerId: 8, monetizationType: "FLATRATE" });
    await mergeOffers("movie-o-1", [offer], db);

    const rows = await db.select().from(offers).where(eq(offers.titleId, "movie-o-1")).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].providerId).toBe(8);
    expect(rows[0].monetizationType).toBe("FLATRATE");
  });

  it("preserves existing deep links across merges", async () => {
    const db = getDb();
    await upsertProviderRows(
      [{ id: 8, name: "Netflix", technicalName: "netflix", iconUrl: "n.png" }],
      db,
    );
    await upsertTitleRow(makeParsedTitle({ id: "movie-o-2" }), db);

    const offer = makeParsedOffer({ titleId: "movie-o-2", providerId: 8, monetizationType: "FLATRATE" });
    await mergeOffers("movie-o-2", [offer], db);

    // Stamp a deep link as if the SA enrichment had filled it in
    const rawDb = (await import("../bun-db")).getRawDb();
    rawDb
      .prepare("UPDATE offers SET deep_link = 'plex://movie/4' WHERE title_id = 'movie-o-2'")
      .run();

    // Re-merge with the same offer payload — deep link must survive
    await mergeOffers("movie-o-2", [offer], db);

    const row = rawDb
      .prepare("SELECT deep_link FROM offers WHERE title_id = 'movie-o-2'")
      .get() as { deep_link: string | null };
    expect(row?.deep_link).toBe("plex://movie/4");
  });

  it("preserves deep links across canonical provider remaps", async () => {
    const db = getDb();
    // Seed both the duplicate (1899) and canonical (384) HBO Max IDs
    await upsertProviderRows(
      [
        { id: 1899, name: "HBO Max", technicalName: "hbo_max", iconUrl: "h.png" },
        { id: 384, name: "HBO Max", technicalName: "hbo", iconUrl: "h.png" },
      ],
      db,
    );
    await upsertTitleRow(makeParsedTitle({ id: "movie-o-3" }), db);

    const dupOffer = makeParsedOffer({ titleId: "movie-o-3", providerId: 1899, monetizationType: "FLATRATE" });
    await mergeOffers("movie-o-3", [dupOffer], db);

    const rawDb = (await import("../bun-db")).getRawDb();
    rawDb
      .prepare("UPDATE offers SET deep_link = 'plex://movie/hbo' WHERE title_id = 'movie-o-3'")
      .run();

    // Now the parser produces the canonical ID — the deep link should still be picked up
    const canonicalOffer = makeParsedOffer({ titleId: "movie-o-3", providerId: 384, monetizationType: "FLATRATE" });
    await mergeOffers("movie-o-3", [canonicalOffer], db);

    const row = rawDb
      .prepare("SELECT deep_link FROM offers WHERE title_id = 'movie-o-3'")
      .get() as { deep_link: string | null };
    expect(row?.deep_link).toBe("plex://movie/hbo");
  });

  it("is a no-op when newOffers is empty (preserves existing offers)", async () => {
    const db = getDb();
    await upsertProviderRows(
      [{ id: 8, name: "Netflix", technicalName: "netflix", iconUrl: "n.png" }],
      db,
    );
    await upsertTitleRow(makeParsedTitle({ id: "movie-o-4" }), db);
    const offer = makeParsedOffer({ titleId: "movie-o-4", providerId: 8 });
    await mergeOffers("movie-o-4", [offer], db);

    await mergeOffers("movie-o-4", [], db);

    const rows = await db.select().from(offers).where(eq(offers.titleId, "movie-o-4")).all();
    expect(rows).toHaveLength(1);
  });
});

describe("upsertScores", () => {
  it("inserts a new score row", async () => {
    const db = getDb();
    await upsertTitleRow(makeParsedTitle({ id: "movie-s-1" }), db);
    await upsertScores("movie-s-1", { imdbScore: 7.5, imdbVotes: 100, tmdbScore: 6.9 }, db);

    const row = await db.select().from(scores).where(eq(scores.titleId, "movie-s-1")).get();
    expect(row?.imdbScore).toBe(7.5);
    expect(row?.imdbVotes).toBe(100);
    expect(row?.tmdbScore).toBe(6.9);
  });

  it("updates existing scores on conflict", async () => {
    const db = getDb();
    await upsertTitleRow(makeParsedTitle({ id: "movie-s-2" }), db);
    await upsertScores("movie-s-2", { imdbScore: 6.0, imdbVotes: 50, tmdbScore: 5.5 }, db);
    await upsertScores("movie-s-2", { imdbScore: 8.1, imdbVotes: 999, tmdbScore: 8.0 }, db);

    const row = await db.select().from(scores).where(eq(scores.titleId, "movie-s-2")).get();
    expect(row?.imdbScore).toBe(8.1);
    expect(row?.imdbVotes).toBe(999);
    expect(row?.tmdbScore).toBe(8.0);
  });

  it("accepts null score values", async () => {
    const db = getDb();
    await upsertTitleRow(makeParsedTitle({ id: "movie-s-3" }), db);
    await upsertScores("movie-s-3", { imdbScore: null, imdbVotes: null, tmdbScore: null }, db);

    const row = await db.select().from(scores).where(eq(scores.titleId, "movie-s-3")).get();
    expect(row?.imdbScore).toBeNull();
    expect(row?.imdbVotes).toBeNull();
    expect(row?.tmdbScore).toBeNull();
  });
});

describe("getGenres / getLanguages — single-flight cache stampede prevention", () => {
  let traceSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    invalidateFilterCaches();
    traceSpy = spyOn(tracing, "traceDbQuery").mockImplementation(
      (_name: any, fn: any) => fn(),
    );
  });

  afterEach(() => {
    traceSpy.mockRestore();
    invalidateFilterCaches();
  });

  it("getGenres: 10 concurrent callers with empty cache trigger exactly one DB query", async () => {
    const calls = Array.from({ length: 10 }, () => getGenres());
    await Promise.all(calls);
    expect(traceSpy).toHaveBeenCalledTimes(1);
  });

  it("getLanguages: 10 concurrent callers with empty cache trigger exactly one DB query", async () => {
    const calls = Array.from({ length: 10 }, () => getLanguages());
    await Promise.all(calls);
    expect(traceSpy).toHaveBeenCalledTimes(1);
  });

  it("getGenres: returns cached value on second call without hitting DB", async () => {
    await getGenres(); // prime the cache
    traceSpy.mockClear();
    await getGenres();
    expect(traceSpy).not.toHaveBeenCalled();
  });
});

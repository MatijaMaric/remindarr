import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createNotifier, createUser } from "../db/repository";
import {
  followPerson,
  getPersonFollowers,
  listPersonCreditAlerts,
} from "../db/repository/person-follows";
import * as tmdbClient from "../tmdb/client";
import type { TmdbPersonDetails } from "../tmdb/types";
import { CONFIG } from "../config";
import {
  checkPersonCredits,
  collectCredits,
  handleCheckPersonCredits,
  isNotifiable,
} from "./person-credits";

const NOW = new Date("2026-10-03T12:00:00Z");

function person(
  cast: Array<Partial<TmdbPersonDetails["combined_credits"]["cast"][number]>>,
  crew: Array<
    Partial<TmdbPersonDetails["combined_credits"]["crew"][number]>
  > = [],
): TmdbPersonDetails {
  const base = {
    media_type: "movie" as const,
    poster_path: null,
    vote_average: 0,
    vote_count: 0,
    popularity: 0,
  };
  return {
    id: 31,
    name: "Tom Hanks",
    biography: "",
    birthday: null,
    deathday: null,
    place_of_birth: null,
    known_for_department: "Acting",
    profile_path: "/tom.jpg",
    also_known_as: [],
    popularity: 1,
    combined_credits: {
      cast: cast.map((c) => ({ ...base, id: 1, character: "", ...c })),
      crew: crew.map((c) => ({
        ...base,
        id: 1,
        job: "",
        department: "",
        ...c,
      })),
    },
  };
}

describe("collectCredits", () => {
  it("keys credits by media type and keeps one entry per title", () => {
    const credits = collectCredits(
      person(
        [
          { id: 10, title: "Big", character: "Josh" },
          { id: 10, media_type: "tv", name: "Big Show", character: "Host" },
        ],
        [{ id: 10, title: "Big", job: "Producer" }],
      ),
    );
    expect([...credits.keys()]).toEqual(["movie:10", "tv:10"]);
    expect(credits.get("movie:10")?.role).toBe("Josh");
    expect(credits.get("tv:10")?.title).toBe("Big Show");
  });
});

describe("isNotifiable", () => {
  const credit = (releaseDate: string | null, genreIds: number[] = []) => ({
    key: "movie:1",
    title: "x",
    role: null,
    releaseDate,
    posterPath: null,
    genreIds,
  });

  it("accepts undated, upcoming and recently released credits", () => {
    expect(isNotifiable(credit(null), NOW)).toBe(true);
    expect(isNotifiable(credit("2027-05-01"), NOW)).toBe(true);
    expect(isNotifiable(credit("2026-09-10"), NOW)).toBe(true);
  });

  it("rejects credits released more than 30 days ago", () => {
    expect(isNotifiable(credit("2026-08-01"), NOW)).toBe(false);
    expect(isNotifiable(credit("1998-07-24"), NOW)).toBe(false);
  });

  it("rejects talk and news shows", () => {
    expect(isNotifiable(credit(null, [10767]), NOW)).toBe(false);
    expect(isNotifiable(credit("2027-01-01", [35, 10763]), NOW)).toBe(false);
  });
});

describe("checkPersonCredits", () => {
  let userId: string;
  let notifierId: string;
  let fetchSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    setupTestDb();
    userId = await createUser("alice", "hash");
    notifierId = await createNotifier(
      userId,
      "discord",
      "Discord",
      {},
      "09:00",
      "UTC",
    );
    await followPerson(
      userId,
      { id: 31, name: "Tom Hanks", profilePath: null },
      ["movie:1"],
    );
    fetchSpy = spyOn(tmdbClient, "fetchPersonDetails");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  afterAll(() => {
    teardownTestDb();
  });

  it("queues only unseen, notifiable credits and updates the snapshot", async () => {
    fetchSpy.mockResolvedValue(
      person([
        { id: 1, title: "Old Seen", release_date: "1994-07-06" },
        {
          id: 2,
          title: "Upcoming",
          character: "Captain",
          release_date: "2099-01-01",
        },
        { id: 3, title: "Backfilled", release_date: "1998-07-24" },
        { id: 4, media_type: "tv", name: "Late Show", genre_ids: [10767] },
      ]),
    );

    await checkPersonCredits(31);

    const alerts = await listPersonCreditAlerts(notifierId);
    expect(alerts).toEqual([
      {
        personId: 31,
        creditKey: "movie:2",
        personName: "Tom Hanks",
        title: "Upcoming",
        role: "Captain",
        releaseDate: "2099-01-01",
        posterPath: null,
      },
    ]);
    const [follower] = await getPersonFollowers(31);
    expect(follower.seenCredits.sort()).toEqual(
      ["movie:1", "movie:2", "movie:3", "tv:4"].sort(),
    );
  });

  it("does not alert twice for the same credit", async () => {
    fetchSpy.mockResolvedValue(
      person([{ id: 2, title: "Upcoming", release_date: "2099-01-01" }]),
    );
    await checkPersonCredits(31);
    await checkPersonCredits(31);
    expect(await listPersonCreditAlerts(notifierId)).toHaveLength(1);
  });

  it("keeps a credit seen after TMDB drops it, so a re-add does not alert", async () => {
    fetchSpy.mockResolvedValue(person([]));
    await checkPersonCredits(31);
    fetchSpy.mockResolvedValue(
      person([{ id: 1, title: "Seen", release_date: "2099-01-01" }]),
    );
    await checkPersonCredits(31);
    expect(await listPersonCreditAlerts(notifierId)).toHaveLength(0);
  });

  it("skips the TMDB call when nobody follows the person", async () => {
    await checkPersonCredits(999);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("handleCheckPersonCredits", () => {
  const originalKey = CONFIG.TMDB_API_KEY;
  afterEach(() => {
    CONFIG.TMDB_API_KEY = originalKey;
  });

  it("rejects a job without a personId", async () => {
    CONFIG.TMDB_API_KEY = "test";
    await expect(handleCheckPersonCredits("{}")).rejects.toThrow(
      "check-person-credits job missing personId",
    );
  });
});

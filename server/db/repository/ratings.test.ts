import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { makeParsedTitle } from "../../test-utils/fixtures";
import { upsertTitles, createUser, upsertEpisodes, watchTitle } from "../repository";
import { follow } from "./follows";
import {
  rateTitle,
  unrateTitle,
  getUserRating,
  getTitleRatings,
  getFriendsRatings,
  rateEpisode,
  unrateEpisode,
  getUserEpisodeRating,
  getEpisodeRatings,
  getFriendsEpisodeRatings,
  getSeasonEpisodeRatings,
  getFriendsLovedThisWeek,
} from "./ratings";
import { getDb } from "../schema";
import { episodes } from "../schema";

let userA: string;
let userB: string;
let userC: string;
let episodeId1: number;
let episodeId2: number;

beforeEach(async () => {
  setupTestDb();
  userA = await createUser("alice", "hash");
  userB = await createUser("bob", "hash");
  userC = await createUser("carol", "hash");
  await upsertTitles([
    makeParsedTitle({ id: "movie-1", title: "Test Movie" }),
    makeParsedTitle({ id: "movie-2", title: "Another Movie" }),
    makeParsedTitle({ id: "show-1", title: "Test Show", objectType: "SHOW" }),
  ]);
  await upsertEpisodes([
    { title_id: "show-1", season_number: 1, episode_number: 1, name: "Pilot", overview: null, air_date: "2024-01-01", still_path: null },
    { title_id: "show-1", season_number: 1, episode_number: 2, name: "Episode 2", overview: null, air_date: "2024-01-08", still_path: null },
  ]);
  const db = getDb();
  const eps = await db.select({ id: episodes.id, episodeNumber: episodes.episodeNumber }).from(episodes).all();
  episodeId1 = eps.find((e) => e.episodeNumber === 1)!.id;
  episodeId2 = eps.find((e) => e.episodeNumber === 2)!.id;
});

afterAll(() => {
  teardownTestDb();
});

describe("rateTitle", () => {
  it("inserts a new rating", async () => {
    await rateTitle(userA, "movie-1", "LOVE");
    const rating = await getUserRating(userA, "movie-1");
    expect(rating).toBe("LOVE");
  });

  it("updates an existing rating (upsert)", async () => {
    await rateTitle(userA, "movie-1", "LIKE");
    await rateTitle(userA, "movie-1", "LOVE");
    const rating = await getUserRating(userA, "movie-1");
    expect(rating).toBe("LOVE");
  });
});

describe("unrateTitle", () => {
  it("removes a rating", async () => {
    await rateTitle(userA, "movie-1", "LIKE");
    await unrateTitle(userA, "movie-1");
    const rating = await getUserRating(userA, "movie-1");
    expect(rating).toBeNull();
  });

  it("is a no-op when no rating exists", async () => {
    await unrateTitle(userA, "movie-1");
    const rating = await getUserRating(userA, "movie-1");
    expect(rating).toBeNull();
  });
});

describe("getUserRating", () => {
  it("returns the rating for a user+title", async () => {
    await rateTitle(userA, "movie-1", "DISLIKE");
    expect(await getUserRating(userA, "movie-1")).toBe("DISLIKE");
  });

  it("returns null when no rating exists", async () => {
    expect(await getUserRating(userA, "movie-1")).toBeNull();
  });
});

describe("getTitleRatings", () => {
  it("returns aggregated counts per rating type", async () => {
    await rateTitle(userA, "movie-1", "LOVE");
    await rateTitle(userB, "movie-1", "LOVE");
    await rateTitle(userC, "movie-1", "LIKE");

    const result = await getTitleRatings("movie-1");
    expect(result.LOVE).toBe(2);
    expect(result.LIKE).toBe(1);
    expect(result.DISLIKE).toBe(0);
    expect(result.HATE).toBe(0);
  });

  it("returns all zeros for an unrated title", async () => {
    const result = await getTitleRatings("movie-2");
    expect(result.LOVE).toBe(0);
    expect(result.LIKE).toBe(0);
    expect(result.DISLIKE).toBe(0);
    expect(result.HATE).toBe(0);
  });
});

describe("getFriendsRatings", () => {
  it("returns ratings from users the current user follows", async () => {
    await follow(userA, userB);
    await follow(userA, userC);
    await rateTitle(userB, "movie-1", "LOVE");
    await rateTitle(userC, "movie-1", "LIKE");

    const result = await getFriendsRatings(userA, "movie-1");
    expect(result).toHaveLength(2);
    const usernames = result.map((r) => r.username);
    expect(usernames).toContain("bob");
    expect(usernames).toContain("carol");
  });

  it("does not include ratings from unfollowed users", async () => {
    await follow(userA, userB);
    await rateTitle(userB, "movie-1", "LOVE");
    await rateTitle(userC, "movie-1", "LIKE"); // not followed by userA

    const result = await getFriendsRatings(userA, "movie-1");
    expect(result).toHaveLength(1);
    expect(result[0].username).toBe("bob");
  });

  it("returns empty list when no friends have rated", async () => {
    await follow(userA, userB);
    const result = await getFriendsRatings(userA, "movie-1");
    expect(result).toHaveLength(0);
  });
});

// ─── Episode Rating Tests ─────────────────────────────────────────────────────

describe("rateEpisode", () => {
  it("inserts a new episode rating", async () => {
    await rateEpisode(userA, episodeId1, "LOVE");
    const result = await getUserEpisodeRating(userA, episodeId1);
    expect(result?.rating).toBe("LOVE");
    expect(result?.review).toBeNull();
  });

  it("inserts with optional review", async () => {
    await rateEpisode(userA, episodeId1, "LIKE", "Great episode!");
    const result = await getUserEpisodeRating(userA, episodeId1);
    expect(result?.rating).toBe("LIKE");
    expect(result?.review).toBe("Great episode!");
  });

  it("upserts — updates existing rating and review", async () => {
    await rateEpisode(userA, episodeId1, "LIKE", "Good");
    await rateEpisode(userA, episodeId1, "LOVE", "Amazing");
    const result = await getUserEpisodeRating(userA, episodeId1);
    expect(result?.rating).toBe("LOVE");
    expect(result?.review).toBe("Amazing");
  });
});

describe("unrateEpisode", () => {
  it("removes an episode rating", async () => {
    await rateEpisode(userA, episodeId1, "LIKE");
    await unrateEpisode(userA, episodeId1);
    const result = await getUserEpisodeRating(userA, episodeId1);
    expect(result).toBeNull();
  });

  it("is a no-op when no rating exists", async () => {
    await unrateEpisode(userA, episodeId1);
    const result = await getUserEpisodeRating(userA, episodeId1);
    expect(result).toBeNull();
  });
});

describe("getUserEpisodeRating", () => {
  it("returns null when no rating exists", async () => {
    expect(await getUserEpisodeRating(userA, episodeId1)).toBeNull();
  });
});

describe("getEpisodeRatings", () => {
  it("returns aggregated counts per rating type", async () => {
    await rateEpisode(userA, episodeId1, "LOVE");
    await rateEpisode(userB, episodeId1, "LOVE");
    await rateEpisode(userC, episodeId1, "LIKE");

    const result = await getEpisodeRatings(episodeId1);
    expect(result.LOVE).toBe(2);
    expect(result.LIKE).toBe(1);
    expect(result.DISLIKE).toBe(0);
    expect(result.HATE).toBe(0);
  });

  it("returns all zeros for an unrated episode", async () => {
    const result = await getEpisodeRatings(episodeId2);
    expect(result.LOVE).toBe(0);
    expect(result.LIKE).toBe(0);
    expect(result.DISLIKE).toBe(0);
    expect(result.HATE).toBe(0);
  });
});

describe("getFriendsEpisodeRatings", () => {
  it("returns ratings from followed users", async () => {
    await follow(userA, userB);
    await rateEpisode(userB, episodeId1, "LOVE");
    await rateEpisode(userC, episodeId1, "LIKE"); // not followed

    const result = await getFriendsEpisodeRatings(userA, episodeId1);
    expect(result).toHaveLength(1);
    expect(result[0].username).toBe("bob");
    expect(result[0].rating).toBe("LOVE");
  });

  it("returns empty list when no friends have rated", async () => {
    await follow(userA, userB);
    const result = await getFriendsEpisodeRatings(userA, episodeId1);
    expect(result).toHaveLength(0);
  });
});

describe("getSeasonEpisodeRatings", () => {
  it("returns aggregate per episode number for a season", async () => {
    await rateEpisode(userA, episodeId1, "LOVE");
    await rateEpisode(userB, episodeId1, "LIKE");
    await rateEpisode(userC, episodeId2, "HATE");

    const result = await getSeasonEpisodeRatings("show-1", 1);
    expect(result[1].LOVE).toBe(1);
    expect(result[1].LIKE).toBe(1);
    expect(result[2].HATE).toBe(1);
    expect(result[2].LOVE).toBe(0);
  });

  it("returns empty object when no ratings exist", async () => {
    const result = await getSeasonEpisodeRatings("show-1", 1);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe("getFriendsLovedThisWeek", () => {
  it("returns titles rated LOVE/LIKE by followed users", async () => {
    await follow(userA, userB);
    await rateTitle(userB, "movie-1", "LOVE");
    await rateTitle(userB, "movie-2", "LIKE");

    const result = await getFriendsLovedThisWeek(userA);
    expect(result.length).toBe(2);
    const ids = result.map((r) => r.id);
    expect(ids).toContain("movie-1");
    expect(ids).toContain("movie-2");
  });

  it("does not return titles rated by non-followed users", async () => {
    // userA does NOT follow userC
    await rateTitle(userC, "movie-1", "LOVE");

    const result = await getFriendsLovedThisWeek(userA);
    expect(result.length).toBe(0);
  });

  it("does not return titles the current user has already rated", async () => {
    await follow(userA, userB);
    await rateTitle(userB, "movie-1", "LOVE");
    // userA has already rated movie-1 themselves
    await rateTitle(userA, "movie-1", "LIKE");

    const result = await getFriendsLovedThisWeek(userA);
    expect(result.length).toBe(0);
  });

  it("does not return titles the current user has watched", async () => {
    await follow(userA, userB);
    await rateTitle(userB, "movie-1", "LOVE");
    await watchTitle("movie-1", userA);

    const result = await getFriendsLovedThisWeek(userA);
    expect(result.length).toBe(0);
  });

  it("returns results ordered by score descending", async () => {
    await follow(userA, userB);
    await follow(userA, userC);
    // movie-1 gets 2 LOVEs (score=4), movie-2 gets 1 LIKE (score=1)
    await rateTitle(userB, "movie-1", "LOVE");
    await rateTitle(userC, "movie-1", "LOVE");
    await rateTitle(userB, "movie-2", "LIKE");

    const result = await getFriendsLovedThisWeek(userA);
    expect(result.length).toBe(2);
    expect(result[0].id).toBe("movie-1");
    expect(result[1].id).toBe("movie-2");
    expect(result[0].score).toBeGreaterThan(result[1].score);
  });

  it("returns empty list when user follows nobody", async () => {
    await rateTitle(userB, "movie-1", "LOVE");

    const result = await getFriendsLovedThisWeek(userA);
    expect(result.length).toBe(0);
  });

  it("respects the limit parameter", async () => {
    await follow(userA, userB);
    await rateTitle(userB, "movie-1", "LOVE");
    await rateTitle(userB, "movie-2", "LIKE");

    const result = await getFriendsLovedThisWeek(userA, 1);
    expect(result.length).toBe(1);
  });
});

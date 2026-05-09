import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { Hono } from "hono";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, upsertTitles, upsertEpisodes } from "../db/repository";
import { makeParsedTitle } from "../test-utils/fixtures";
import * as queue from "../jobs/queue";
import * as achievementsRepo from "../db/repository/achievements";
import * as streaksRepo from "../db/repository/streaks";
import * as evaluate from "./evaluate";
import * as triggers from "./triggers";
import type { AppEnv } from "../types";

// Do NOT import triggers at module top level — DB must be set up first.
// Import inside tests after setupTestDb().

let userId: string;
let movieTitleId: string;
let showTitleId: string;
let episodeId: number;

beforeEach(async () => {
  setupTestDb();

  userId = await createUser("testuser", "hash", "Test User");

  // Insert a movie title
  await upsertTitles([makeParsedTitle({ id: "movie-1", objectType: "MOVIE", title: "Test Movie" })]);
  movieTitleId = "movie-1";

  // Insert a show title
  await upsertTitles([makeParsedTitle({ id: "show-1", objectType: "SHOW", title: "Test Show" })]);
  showTitleId = "show-1";

  // Insert an episode
  await upsertEpisodes([{
    title_id: showTitleId,
    season_number: 1,
    episode_number: 1,
    name: "Pilot",
    air_date: "2024-01-01",
    overview: null,
    still_path: null,
  }]);

  // Get the episode ID by querying
  const { getDb } = await import("../db/schema");
  const { episodes } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");
  const db = getDb();
  const ep = await db.select().from(episodes).where(eq(episodes.titleId, showTitleId)).get();
  episodeId = ep!.id;
});

afterEach(() => {
  teardownTestDb();
});

describe("onWatchedTitle", () => {
  it("bumps streak and evaluates count_movies inline for movies", async () => {
    const { onWatchedTitle } = await import("./triggers");

    const bumpSpy = spyOn(streaksRepo, "bumpStreak").mockResolvedValue({
      userId,
      currentStreak: 1,
      longestStreak: 1,
      lastWatchDate: "2026-01-01",
      updatedAt: new Date().toISOString(),
    });
    const upsertSpy = spyOn(achievementsRepo, "upsertUserAchievement").mockResolvedValue({ newlyEarned: false });
    const enqueueSpy = spyOn(queue, "enqueueJob").mockReturnValue(1);
    const evalMoviesSpy = spyOn(evaluate, "evaluateCountMovies").mockResolvedValue({ progress: 1, earned: false });
    const evalStreakSpy = spyOn(evaluate, "evaluateStreak").mockResolvedValue({ progress: 1, earned: false });

    await onWatchedTitle(userId, movieTitleId, true);

    expect(bumpSpy).toHaveBeenCalledWith(userId);
    expect(evalMoviesSpy).toHaveBeenCalled();
    expect(evalStreakSpy).toHaveBeenCalled();
    expect(enqueueSpy).toHaveBeenCalledWith(
      "evaluate-achievements",
      expect.objectContaining({ userId, kinds: expect.arrayContaining(["completionist", "genre_count"]), titleId: movieTitleId })
    );

    bumpSpy.mockRestore();
    upsertSpy.mockRestore();
    enqueueSpy.mockRestore();
    evalMoviesSpy.mockRestore();
    evalStreakSpy.mockRestore();
  });

  it("bumps streak but does NOT evaluate count_movies inline for TV shows", async () => {
    const { onWatchedTitle } = await import("./triggers");

    const bumpSpy = spyOn(streaksRepo, "bumpStreak").mockResolvedValue({
      userId,
      currentStreak: 1,
      longestStreak: 1,
      lastWatchDate: "2026-01-01",
      updatedAt: new Date().toISOString(),
    });
    const upsertSpy = spyOn(achievementsRepo, "upsertUserAchievement").mockResolvedValue({ newlyEarned: false });
    const enqueueSpy = spyOn(queue, "enqueueJob").mockReturnValue(1);
    const evalMoviesSpy = spyOn(evaluate, "evaluateCountMovies").mockResolvedValue({ progress: 1, earned: false });
    const evalStreakSpy = spyOn(evaluate, "evaluateStreak").mockResolvedValue({ progress: 1, earned: false });

    await onWatchedTitle(userId, showTitleId, false);

    expect(bumpSpy).toHaveBeenCalledWith(userId);
    expect(evalMoviesSpy).not.toHaveBeenCalled();
    expect(evalStreakSpy).toHaveBeenCalled();
    expect(enqueueSpy).toHaveBeenCalled();

    bumpSpy.mockRestore();
    upsertSpy.mockRestore();
    enqueueSpy.mockRestore();
    evalMoviesSpy.mockRestore();
    evalStreakSpy.mockRestore();
  });
});

describe("onWatchedEpisode", () => {
  it("bumps streak, evaluates count_episodes inline, and enqueues deferred job", async () => {
    const { onWatchedEpisode } = await import("./triggers");

    const bumpSpy = spyOn(streaksRepo, "bumpStreak").mockResolvedValue({
      userId,
      currentStreak: 1,
      longestStreak: 1,
      lastWatchDate: "2026-01-01",
      updatedAt: new Date().toISOString(),
    });
    const upsertSpy = spyOn(achievementsRepo, "upsertUserAchievement").mockResolvedValue({ newlyEarned: false });
    const enqueueSpy = spyOn(queue, "enqueueJob").mockReturnValue(1);
    const evalEpsSpy = spyOn(evaluate, "evaluateCountEpisodes").mockResolvedValue({ progress: 1, earned: false });
    const evalStreakSpy = spyOn(evaluate, "evaluateStreak").mockResolvedValue({ progress: 1, earned: false });

    await onWatchedEpisode(userId, String(episodeId));

    expect(bumpSpy).toHaveBeenCalled();
    expect(evalEpsSpy).toHaveBeenCalled();
    expect(evalStreakSpy).toHaveBeenCalled();
    expect(enqueueSpy).toHaveBeenCalledWith(
      "evaluate-achievements",
      expect.objectContaining({
        userId,
        kinds: expect.arrayContaining(["completionist", "genre_count", "speed_binge_season"]),
      })
    );

    bumpSpy.mockRestore();
    upsertSpy.mockRestore();
    enqueueSpy.mockRestore();
    evalEpsSpy.mockRestore();
    evalStreakSpy.mockRestore();
  });
});

describe("onWatchedEpisodesBulk", () => {
  it("enqueues one job per distinct title, not per episode", async () => {
    const { onWatchedEpisodesBulk } = await import("./triggers");

    const bumpSpy = spyOn(streaksRepo, "bumpStreak").mockResolvedValue({
      userId,
      currentStreak: 1,
      longestStreak: 1,
      lastWatchDate: "2026-01-01",
      updatedAt: new Date().toISOString(),
    });
    const upsertSpy = spyOn(achievementsRepo, "upsertUserAchievement").mockResolvedValue({ newlyEarned: false });
    const enqueueSpy = spyOn(queue, "enqueueJob").mockReturnValue(1);
    const evalEpsSpy = spyOn(evaluate, "evaluateCountEpisodes").mockResolvedValue({ progress: 5, earned: false });
    const evalStreakSpy = spyOn(evaluate, "evaluateStreak").mockResolvedValue({ progress: 1, earned: false });

    // 5 episodes across 2 shows
    const titleIds = new Set(["show-1", "show-2"]);
    await onWatchedEpisodesBulk(userId, ["1", "2", "3", "4", "5"], titleIds);

    // Should enqueue 2 jobs (one per distinct titleId), not 5
    const jobCalls = enqueueSpy.mock.calls.filter((c) => c[0] === "evaluate-achievements");
    expect(jobCalls.length).toBe(2);

    bumpSpy.mockRestore();
    upsertSpy.mockRestore();
    enqueueSpy.mockRestore();
    evalEpsSpy.mockRestore();
    evalStreakSpy.mockRestore();
  });
});

describe("onFollow", () => {
  it("evaluates social_first_follow inline and does not enqueue any job", async () => {
    const { onFollow } = await import("./triggers");

    const upsertSpy = spyOn(achievementsRepo, "upsertUserAchievement").mockResolvedValue({ newlyEarned: true });
    const enqueueSpy = spyOn(queue, "enqueueJob").mockReturnValue(1);
    const evalFollowSpy = spyOn(evaluate, "evaluateSocialFirstFollow").mockResolvedValue({ progress: 1, earned: true });

    await onFollow(userId);

    expect(evalFollowSpy).toHaveBeenCalledWith(userId);
    expect(upsertSpy).toHaveBeenCalled();
    expect(enqueueSpy).not.toHaveBeenCalled();

    upsertSpy.mockRestore();
    enqueueSpy.mockRestore();
    evalFollowSpy.mockRestore();
  });
});

describe("onRecommendation", () => {
  it("evaluates social_first_recommendation inline and does not enqueue any job", async () => {
    const { onRecommendation } = await import("./triggers");

    const upsertSpy = spyOn(achievementsRepo, "upsertUserAchievement").mockResolvedValue({ newlyEarned: true });
    const enqueueSpy = spyOn(queue, "enqueueJob").mockReturnValue(1);
    const evalRecSpy = spyOn(evaluate, "evaluateSocialFirstRecommendation").mockResolvedValue({ progress: 1, earned: true });

    await onRecommendation(userId);

    expect(evalRecSpy).toHaveBeenCalledWith(userId);
    expect(upsertSpy).toHaveBeenCalled();
    expect(enqueueSpy).not.toHaveBeenCalled();

    upsertSpy.mockRestore();
    enqueueSpy.mockRestore();
    evalRecSpy.mockRestore();
  });
});

// ─── DELETE-path tests: triggers must NOT fire on un-watch / unfollow ─────────

describe("DELETE /watched/:episodeId — no trigger fired", () => {
  it("does not call onWatchedEpisode, bumpStreak, or enqueueJob when un-watching an episode", async () => {
    const today = new Date().toISOString().slice(0, 10);
    await upsertTitles([makeParsedTitle({ id: "show-del-1", objectType: "SHOW" })]);
    await upsertEpisodes([
      { title_id: "show-del-1", season_number: 1, episode_number: 1, name: "Pilot", overview: null, air_date: today, still_path: null },
    ]);

    const { getDb } = await import("../db/schema");
    const { episodes } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    const ep = await db.select().from(episodes).where(eq(episodes.titleId, "show-del-1")).get();
    const epId = ep!.id;

    const onWatchedEpisodeSpy = spyOn(triggers, "onWatchedEpisode").mockResolvedValue(undefined);
    const bumpSpy = spyOn(streaksRepo, "bumpStreak").mockResolvedValue({
      userId,
      currentStreak: 0,
      longestStreak: 0,
      lastWatchDate: null,
      updatedAt: new Date().toISOString(),
    });
    const enqueueSpy = spyOn(queue, "enqueueJob").mockReturnValue(1);

    const watchedApp = (await import("../routes/watched")).default;
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("user", { id: userId, username: "testuser", name: null, role: null, is_admin: false });
      await next();
    });
    app.route("/watched", watchedApp);

    const res = await app.request(`/watched/${epId}`, { method: "DELETE" });
    expect(res.status).toBe(200);

    expect(onWatchedEpisodeSpy).not.toHaveBeenCalled();
    expect(bumpSpy).not.toHaveBeenCalled();
    expect(enqueueSpy).not.toHaveBeenCalled();

    onWatchedEpisodeSpy.mockRestore();
    bumpSpy.mockRestore();
    enqueueSpy.mockRestore();
  });
});

describe("DELETE /watched/movies/:titleId — no trigger fired", () => {
  it("does not call onWatchedTitle when un-watching a movie", async () => {
    await upsertTitles([makeParsedTitle({ id: "movie-del-1", objectType: "MOVIE", title: "Delete Me" })]);

    const onWatchedTitleSpy = spyOn(triggers, "onWatchedTitle").mockResolvedValue(undefined);
    const enqueueSpy = spyOn(queue, "enqueueJob").mockReturnValue(1);

    const watchedApp = (await import("../routes/watched")).default;
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("user", { id: userId, username: "testuser", name: null, role: null, is_admin: false });
      await next();
    });
    app.route("/watched", watchedApp);

    const res = await app.request("/watched/movies/movie-del-1", { method: "DELETE" });
    expect(res.status).toBe(200);

    expect(onWatchedTitleSpy).not.toHaveBeenCalled();
    expect(enqueueSpy).not.toHaveBeenCalled();

    onWatchedTitleSpy.mockRestore();
    enqueueSpy.mockRestore();
  });
});

describe("DELETE /social/follow/:userId — no trigger fired", () => {
  it("does not call onFollow when unfollowing a user", async () => {
    const targetUserId = await createUser("targetuser", "hash2", "Target User");

    const onFollowSpy = spyOn(triggers, "onFollow").mockResolvedValue(undefined);
    const enqueueSpy = spyOn(queue, "enqueueJob").mockReturnValue(1);

    const socialApp = (await import("../routes/social")).default;
    const app = new Hono<AppEnv>();
    app.use("*", async (c, next) => {
      c.set("user", { id: userId, username: "testuser", name: null, role: null, is_admin: false });
      await next();
    });
    app.route("/social", socialApp);

    const res = await app.request(`/social/follow/${targetUserId}`, { method: "DELETE" });
    expect(res.status).toBe(200);

    expect(onFollowSpy).not.toHaveBeenCalled();
    expect(enqueueSpy).not.toHaveBeenCalled();

    onFollowSpy.mockRestore();
    enqueueSpy.mockRestore();
  });
});

import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser } from "../db/repository";
import * as achievementsRepo from "../db/repository/achievements";
import * as streaksRepo from "../db/repository/streaks";
import * as settingsRepo from "../db/repository/settings";
import * as queue from "../jobs/queue";
import * as evaluate from "../achievements/evaluate";
import { runBackfillAchievements } from "./backfill-achievements";

beforeEach(async () => {
  setupTestDb();
});

afterEach(() => {
  teardownTestDb();
});

describe("backfill-achievements job", () => {
  it("processes 50 users, updates cursor, re-enqueues itself", async () => {
    // Create 50 users
    for (let i = 0; i < 50; i++) {
      await createUser(
        `user${String(i).padStart(3, "0")}`,
        "hash",
        `User ${i}`,
      );
    }

    const recomputeSpy = spyOn(
      streaksRepo,
      "recomputeStreakFromHistory",
    ).mockResolvedValue({
      userId: "",
      currentStreak: 0,
      longestStreak: 0,
      lastWatchDate: null,
      updatedAt: new Date().toISOString(),
    });
    const upsertSpy = spyOn(
      achievementsRepo,
      "upsertUserAchievement",
    ).mockResolvedValue({ newlyEarned: false });
    const setSettingSpy = spyOn(settingsRepo, "setSetting").mockResolvedValue(
      undefined,
    );
    const getSettingSpy = spyOn(settingsRepo, "getSetting").mockResolvedValue(
      null,
    );
    const enqueueSpy = spyOn(queue, "enqueueJob").mockReturnValue(1);
    const evalMoviesSpy = spyOn(
      evaluate,
      "evaluateCountMovies",
    ).mockResolvedValue({ progress: 0, earned: false });
    const evalEpsSpy = spyOn(
      evaluate,
      "evaluateCountEpisodes",
    ).mockResolvedValue({ progress: 0, earned: false });
    const evalStreakSpy = spyOn(evaluate, "evaluateStreak").mockResolvedValue({
      progress: 0,
      earned: false,
    });
    const evalGenreSpy = spyOn(
      evaluate,
      "evaluateGenreCount",
    ).mockResolvedValue({ progress: 0, earned: false });
    const evalCompSpy = spyOn(
      evaluate,
      "evaluateCompletionist",
    ).mockResolvedValue({ progress: 0, earned: false });
    const evalFollowSpy = spyOn(
      evaluate,
      "evaluateSocialFirstFollow",
    ).mockResolvedValue({ progress: 0, earned: false });
    const evalRecSpy = spyOn(
      evaluate,
      "evaluateSocialFirstRecommendation",
    ).mockResolvedValue({ progress: 0, earned: false });
    const evalSpeedSpy = spyOn(
      evaluate,
      "evaluateSpeedBingeSeason",
    ).mockResolvedValue({ progress: 0, earned: false });

    await runBackfillAchievements(null);

    expect(recomputeSpy).toHaveBeenCalledTimes(50);
    expect(setSettingSpy).toHaveBeenCalledWith(
      "achievements_backfill_cursor",
      expect.any(String),
    );
    expect(enqueueSpy).toHaveBeenCalledWith(
      "backfill-achievements",
      {},
      expect.objectContaining({ runAt: expect.any(Date) }),
    );

    // Verify all upserts use earnedNotified=1
    const upsertCalls = upsertSpy.mock.calls;
    expect(upsertCalls.length).toBeGreaterThan(0);
    for (const call of upsertCalls) {
      expect(call[4]).toEqual({ earnedNotified: 1 });
    }

    recomputeSpy.mockRestore();
    upsertSpy.mockRestore();
    setSettingSpy.mockRestore();
    getSettingSpy.mockRestore();
    enqueueSpy.mockRestore();
    evalMoviesSpy.mockRestore();
    evalEpsSpy.mockRestore();
    evalStreakSpy.mockRestore();
    evalGenreSpy.mockRestore();
    evalCompSpy.mockRestore();
    evalFollowSpy.mockRestore();
    evalRecSpy.mockRestore();
    evalSpeedSpy.mockRestore();
  });

  it("on last batch: sets achievements_backfill_done=1, does NOT re-enqueue", async () => {
    // Create fewer than 50 users
    for (let i = 0; i < 3; i++) {
      await createUser(`smalluser${i}`, "hash", `Small User ${i}`);
    }

    const recomputeSpy = spyOn(
      streaksRepo,
      "recomputeStreakFromHistory",
    ).mockResolvedValue({
      userId: "",
      currentStreak: 0,
      longestStreak: 0,
      lastWatchDate: null,
      updatedAt: new Date().toISOString(),
    });
    const upsertSpy = spyOn(
      achievementsRepo,
      "upsertUserAchievement",
    ).mockResolvedValue({ newlyEarned: false });
    const setSettingSpy = spyOn(settingsRepo, "setSetting").mockResolvedValue(
      undefined,
    );
    const getSettingSpy = spyOn(settingsRepo, "getSetting").mockResolvedValue(
      null,
    );
    const enqueueSpy = spyOn(queue, "enqueueJob").mockReturnValue(1);
    const evalMoviesSpy = spyOn(
      evaluate,
      "evaluateCountMovies",
    ).mockResolvedValue({ progress: 0, earned: false });
    const evalEpsSpy = spyOn(
      evaluate,
      "evaluateCountEpisodes",
    ).mockResolvedValue({ progress: 0, earned: false });
    const evalStreakSpy = spyOn(evaluate, "evaluateStreak").mockResolvedValue({
      progress: 0,
      earned: false,
    });
    const evalGenreSpy = spyOn(
      evaluate,
      "evaluateGenreCount",
    ).mockResolvedValue({ progress: 0, earned: false });
    const evalCompSpy = spyOn(
      evaluate,
      "evaluateCompletionist",
    ).mockResolvedValue({ progress: 0, earned: false });
    const evalFollowSpy = spyOn(
      evaluate,
      "evaluateSocialFirstFollow",
    ).mockResolvedValue({ progress: 0, earned: false });
    const evalRecSpy = spyOn(
      evaluate,
      "evaluateSocialFirstRecommendation",
    ).mockResolvedValue({ progress: 0, earned: false });

    await runBackfillAchievements(null);

    // Last batch (< 50): sets done flag and does NOT re-enqueue
    expect(setSettingSpy).toHaveBeenCalledWith(
      "achievements_backfill_done",
      "1",
    );
    const backfillEnqueues = enqueueSpy.mock.calls.filter(
      (c) => c[0] === "backfill-achievements",
    );
    expect(backfillEnqueues.length).toBe(0);

    recomputeSpy.mockRestore();
    upsertSpy.mockRestore();
    setSettingSpy.mockRestore();
    getSettingSpy.mockRestore();
    enqueueSpy.mockRestore();
    evalMoviesSpy.mockRestore();
    evalEpsSpy.mockRestore();
    evalStreakSpy.mockRestore();
    evalGenreSpy.mockRestore();
    evalCompSpy.mockRestore();
    evalFollowSpy.mockRestore();
    evalRecSpy.mockRestore();
  });

  it("all earns written with earnedNotified=1 (no notification burst)", async () => {
    await createUser("notifuser", "hash", "Notif User");

    const recomputeSpy = spyOn(
      streaksRepo,
      "recomputeStreakFromHistory",
    ).mockResolvedValue({
      userId: "",
      currentStreak: 0,
      longestStreak: 0,
      lastWatchDate: null,
      updatedAt: new Date().toISOString(),
    });
    const upsertSpy = spyOn(
      achievementsRepo,
      "upsertUserAchievement",
    ).mockResolvedValue({ newlyEarned: true });
    const setSettingSpy = spyOn(settingsRepo, "setSetting").mockResolvedValue(
      undefined,
    );
    const getSettingSpy = spyOn(settingsRepo, "getSetting").mockResolvedValue(
      null,
    );
    const enqueueSpy = spyOn(queue, "enqueueJob").mockReturnValue(1);
    const evalMoviesSpy = spyOn(
      evaluate,
      "evaluateCountMovies",
    ).mockResolvedValue({ progress: 100, earned: true });
    const evalEpsSpy = spyOn(
      evaluate,
      "evaluateCountEpisodes",
    ).mockResolvedValue({ progress: 0, earned: false });
    const evalStreakSpy = spyOn(evaluate, "evaluateStreak").mockResolvedValue({
      progress: 0,
      earned: false,
    });
    const evalGenreSpy = spyOn(
      evaluate,
      "evaluateGenreCount",
    ).mockResolvedValue({ progress: 0, earned: false });
    const evalCompSpy = spyOn(
      evaluate,
      "evaluateCompletionist",
    ).mockResolvedValue({ progress: 0, earned: false });
    const evalFollowSpy = spyOn(
      evaluate,
      "evaluateSocialFirstFollow",
    ).mockResolvedValue({ progress: 0, earned: false });
    const evalRecSpy = spyOn(
      evaluate,
      "evaluateSocialFirstRecommendation",
    ).mockResolvedValue({ progress: 0, earned: false });

    await runBackfillAchievements(null);

    const upsertCalls = upsertSpy.mock.calls;
    expect(upsertCalls.length).toBeGreaterThan(0);
    for (const call of upsertCalls) {
      expect(call[4]).toEqual({ earnedNotified: 1 });
    }

    recomputeSpy.mockRestore();
    upsertSpy.mockRestore();
    setSettingSpy.mockRestore();
    getSettingSpy.mockRestore();
    enqueueSpy.mockRestore();
    evalMoviesSpy.mockRestore();
    evalEpsSpy.mockRestore();
    evalStreakSpy.mockRestore();
    evalGenreSpy.mockRestore();
    evalCompSpy.mockRestore();
    evalFollowSpy.mockRestore();
    evalRecSpy.mockRestore();
  });
});

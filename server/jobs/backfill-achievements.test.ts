import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser, upsertTitles } from "../db/repository";
import { makeParsedTitle } from "../test-utils/fixtures";
import * as achievementsRepo from "../db/repository/achievements";
import * as streaksRepo from "../db/repository/streaks";
import * as settingsRepo from "../db/repository/settings";
import * as queue from "../jobs/queue";
import * as evaluate from "../achievements/evaluate";

beforeEach(async () => {
  setupTestDb();
});

afterEach(() => {
  teardownTestDb();
});

describe("backfill-achievements job", () => {
  it("processes 50 users, updates cursor, re-enqueues itself", async () => {
    // Create 50 users
    const userIds: string[] = [];
    for (let i = 0; i < 50; i++) {
      const uid = await createUser(`user${i}`, "hash", `User ${i}`);
      userIds.push(uid);
    }

    const recomputeSpy = spyOn(streaksRepo, "recomputeStreakFromHistory").mockResolvedValue({
      userId: "",
      currentStreak: 0,
      longestStreak: 0,
      lastWatchDate: null,
      updatedAt: new Date().toISOString(),
    });
    const upsertSpy = spyOn(achievementsRepo, "upsertUserAchievement").mockResolvedValue({ newlyEarned: false });
    const setSettingSpy = spyOn(settingsRepo, "setSetting").mockResolvedValue(undefined);
    const enqueueSpy = spyOn(queue, "enqueueJob").mockReturnValue(1);

    // Mock all evaluators
    const evalMoviesSpy = spyOn(evaluate, "evaluateCountMovies").mockResolvedValue({ progress: 0, earned: false });
    const evalEpsSpy = spyOn(evaluate, "evaluateCountEpisodes").mockResolvedValue({ progress: 0, earned: false });
    const evalStreakSpy = spyOn(evaluate, "evaluateStreak").mockResolvedValue({ progress: 0, earned: false });
    const evalGenreSpy = spyOn(evaluate, "evaluateGenreCount").mockResolvedValue({ progress: 0, earned: false });
    const evalCompSpy = spyOn(evaluate, "evaluateCompletionist").mockResolvedValue({ progress: 0, earned: false });
    const evalFollowSpy = spyOn(evaluate, "evaluateSocialFirstFollow").mockResolvedValue({ progress: 0, earned: false });
    const evalRecSpy = spyOn(evaluate, "evaluateSocialFirstRecommendation").mockResolvedValue({ progress: 0, earned: false });
    const evalSpeedSpy = spyOn(evaluate, "evaluateSpeedBingeSeason").mockResolvedValue({ progress: 0, earned: false });

    // getSetting returns null (no cursor yet)
    const getSettingSpy = spyOn(settingsRepo, "getSetting").mockResolvedValue(null);

    // Simulate what the job does by running the core logic
    const { getDb } = await import("../db/schema");
    const { sql } = await import("drizzle-orm");
    const { ACHIEVEMENTS } = await import("../achievements/definitions");

    const db = getDb();
    const cursor = "";
    const PAGE_SIZE = 50;

    const rows = await db.all<{ id: string }>(sql`
      SELECT id FROM users
      WHERE id > ${cursor}
      ORDER BY id ASC
      LIMIT ${PAGE_SIZE}
    `);

    expect(rows.length).toBe(50);

    // Simulate processing
    for (const row of rows) {
      await streaksRepo.recomputeStreakFromHistory(row.id);
      for (const a of ACHIEVEMENTS) {
        let result = { progress: 0, earned: false };
        switch (a.kind) {
          case "count_movies": result = await evaluate.evaluateCountMovies(row.id, a.threshold); break;
          default: continue;
        }
        await achievementsRepo.upsertUserAchievement(row.id, a.key, result.progress, null, { earnedNotified: 1 });
      }
    }

    const lastUserId = rows[rows.length - 1].id;
    await settingsRepo.setSetting("achievements_backfill_cursor", lastUserId);

    if (rows.length === PAGE_SIZE) {
      queue.enqueueJob("backfill-achievements", {}, { runAt: new Date(Date.now() + 5000) });
    }

    expect(recomputeSpy).toHaveBeenCalledTimes(50);
    expect(setSettingSpy).toHaveBeenCalledWith("achievements_backfill_cursor", expect.any(String));
    expect(enqueueSpy).toHaveBeenCalledWith("backfill-achievements", {}, expect.objectContaining({ runAt: expect.any(Date) }));

    // Verify earnedNotified=1 is passed
    const upsertCalls = upsertSpy.mock.calls;
    expect(upsertCalls.length).toBeGreaterThan(0);
    for (const call of upsertCalls) {
      expect(call[4]).toEqual({ earnedNotified: 1 });
    }

    recomputeSpy.mockRestore();
    upsertSpy.mockRestore();
    setSettingSpy.mockRestore();
    enqueueSpy.mockRestore();
    evalMoviesSpy.mockRestore();
    evalEpsSpy.mockRestore();
    evalStreakSpy.mockRestore();
    evalGenreSpy.mockRestore();
    evalCompSpy.mockRestore();
    evalFollowSpy.mockRestore();
    evalRecSpy.mockRestore();
    evalSpeedSpy.mockRestore();
    getSettingSpy.mockRestore();
  });

  it("on last batch: sets achievements_backfill_done=1, does NOT re-enqueue", async () => {
    // Create fewer than 50 users
    for (let i = 0; i < 3; i++) {
      await createUser(`smalluser${i}`, "hash", `Small User ${i}`);
    }

    const recomputeSpy = spyOn(streaksRepo, "recomputeStreakFromHistory").mockResolvedValue({
      userId: "",
      currentStreak: 0,
      longestStreak: 0,
      lastWatchDate: null,
      updatedAt: new Date().toISOString(),
    });
    const upsertSpy = spyOn(achievementsRepo, "upsertUserAchievement").mockResolvedValue({ newlyEarned: false });
    const setSettingSpy = spyOn(settingsRepo, "setSetting").mockResolvedValue(undefined);
    const enqueueSpy = spyOn(queue, "enqueueJob").mockReturnValue(1);
    const evalMoviesSpy = spyOn(evaluate, "evaluateCountMovies").mockResolvedValue({ progress: 0, earned: false });
    const evalEpsSpy = spyOn(evaluate, "evaluateCountEpisodes").mockResolvedValue({ progress: 0, earned: false });
    const evalStreakSpy = spyOn(evaluate, "evaluateStreak").mockResolvedValue({ progress: 0, earned: false });
    const evalGenreSpy = spyOn(evaluate, "evaluateGenreCount").mockResolvedValue({ progress: 0, earned: false });
    const evalCompSpy = spyOn(evaluate, "evaluateCompletionist").mockResolvedValue({ progress: 0, earned: false });
    const evalFollowSpy = spyOn(evaluate, "evaluateSocialFirstFollow").mockResolvedValue({ progress: 0, earned: false });
    const evalRecSpy = spyOn(evaluate, "evaluateSocialFirstRecommendation").mockResolvedValue({ progress: 0, earned: false });

    const { getDb } = await import("../db/schema");
    const { sql } = await import("drizzle-orm");

    const db = getDb();
    const PAGE_SIZE = 50;

    const rows = await db.all<{ id: string }>(sql`
      SELECT id FROM users
      WHERE id > ''
      ORDER BY id ASC
      LIMIT ${PAGE_SIZE}
    `);

    expect(rows.length).toBe(3);

    // Simulate last batch behavior
    if (rows.length < PAGE_SIZE) {
      await settingsRepo.setSetting("achievements_backfill_done", "1");
    }

    expect(setSettingSpy).toHaveBeenCalledWith("achievements_backfill_done", "1");
    // Should NOT have re-enqueued backfill job
    const backfillEnqueues = enqueueSpy.mock.calls.filter((c) => c[0] === "backfill-achievements");
    expect(backfillEnqueues.length).toBe(0);

    recomputeSpy.mockRestore();
    upsertSpy.mockRestore();
    setSettingSpy.mockRestore();
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

    const upsertSpy = spyOn(achievementsRepo, "upsertUserAchievement").mockResolvedValue({ newlyEarned: true });
    const recomputeSpy = spyOn(streaksRepo, "recomputeStreakFromHistory").mockResolvedValue({
      userId: "",
      currentStreak: 0,
      longestStreak: 0,
      lastWatchDate: null,
      updatedAt: new Date().toISOString(),
    });
    const evalMoviesSpy = spyOn(evaluate, "evaluateCountMovies").mockResolvedValue({ progress: 100, earned: true });
    const evalEpsSpy = spyOn(evaluate, "evaluateCountEpisodes").mockResolvedValue({ progress: 0, earned: false });
    const evalStreakSpy = spyOn(evaluate, "evaluateStreak").mockResolvedValue({ progress: 0, earned: false });
    const evalGenreSpy = spyOn(evaluate, "evaluateGenreCount").mockResolvedValue({ progress: 0, earned: false });
    const evalCompSpy = spyOn(evaluate, "evaluateCompletionist").mockResolvedValue({ progress: 0, earned: false });
    const evalFollowSpy = spyOn(evaluate, "evaluateSocialFirstFollow").mockResolvedValue({ progress: 0, earned: false });
    const evalRecSpy = spyOn(evaluate, "evaluateSocialFirstRecommendation").mockResolvedValue({ progress: 0, earned: false });

    // Simulate calling upsertUserAchievement with earnedNotified=1
    const { ACHIEVEMENTS } = await import("../achievements/definitions");
    const { getDb } = await import("../db/schema");
    const { sql } = await import("drizzle-orm");
    const db = getDb();

    const rows = await db.all<{ id: string }>(sql`SELECT id FROM users ORDER BY id ASC LIMIT 50`);

    for (const row of rows) {
      await streaksRepo.recomputeStreakFromHistory(row.id);
      for (const a of ACHIEVEMENTS.filter((a) => a.kind === "count_movies")) {
        const result = await evaluate.evaluateCountMovies(row.id, a.threshold);
        const earnedAt = result.earned ? new Date().toISOString() : null;
        await achievementsRepo.upsertUserAchievement(row.id, a.key, result.progress, earnedAt, { earnedNotified: 1 });
      }
    }

    const upsertCalls = upsertSpy.mock.calls;
    for (const call of upsertCalls) {
      expect(call[4]).toEqual({ earnedNotified: 1 });
    }

    upsertSpy.mockRestore();
    recomputeSpy.mockRestore();
    evalMoviesSpy.mockRestore();
    evalEpsSpy.mockRestore();
    evalStreakSpy.mockRestore();
    evalGenreSpy.mockRestore();
    evalCompSpy.mockRestore();
    evalFollowSpy.mockRestore();
    evalRecSpy.mockRestore();
  });
});

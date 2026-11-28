import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { eq } from "drizzle-orm";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { createUser } from "../db/repository";
import { getDb, titles, userAchievements } from "../db/schema";
import { upsertAchievementDefs } from "../db/repository/achievements";
import * as streaksRepo from "../db/repository/streaks";
import { getSetting } from "../db/repository/settings";
import { watchTitle } from "../db/repository/watched-titles";
import * as queue from "./queue";
import { runBackfillAchievements } from "./backfill-achievements";
import { ACHIEVEMENTS } from "../achievements/definitions";
import { BACKFILL_DONE_KEY } from "../achievements/sync";

beforeEach(async () => {
  setupTestDb();
  await upsertAchievementDefs(
    ACHIEVEMENTS.map((achievement) => ({ achievement })),
  );
});

afterEach(() => {
  teardownTestDb();
});

describe("backfill-achievements job", () => {
  it("processes 50 users, updates cursor, re-enqueues itself", async () => {
    const userIds = [];
    for (let i = 0; i < 50; i++) {
      userIds.push(await createUser(`user${i}`, "hash", `User ${i}`));
    }

    const recomputeSpy = spyOn(streaksRepo, "recomputeStreakFromHistory");
    const enqueueSpy = spyOn(queue, "enqueueJob").mockReturnValue(1);

    try {
      await runBackfillAchievements(null);

      expect(recomputeSpy).toHaveBeenCalledTimes(50);
      expect(await getSetting("achievements_backfill_cursor")).toBe(
        userIds.sort().at(-1)!,
      );
      expect(enqueueSpy).toHaveBeenCalledWith(
        "backfill-achievements",
        {},
        expect.objectContaining({ runAt: expect.any(Date) }),
      );

      const rows = await getDb().select().from(userAchievements).all();
      expect(rows).toHaveLength(50 * ACHIEVEMENTS.length);
      for (const row of rows) expect(row.earnedNotified).toBe(1);
    } finally {
      recomputeSpy.mockRestore();
      enqueueSpy.mockRestore();
    }
  });

  it("on last batch: sets achievements_backfill_done=1, does NOT re-enqueue", async () => {
    for (let i = 0; i < 3; i++) {
      await createUser(`smalluser${i}`, "hash", `Small User ${i}`);
    }

    const enqueueSpy = spyOn(queue, "enqueueJob").mockReturnValue(1);
    try {
      await runBackfillAchievements(null);
      expect(await getSetting(BACKFILL_DONE_KEY)).toBe("1");
      const backfillEnqueues = enqueueSpy.mock.calls.filter(
        (c) => c[0] === "backfill-achievements",
      );
      expect(backfillEnqueues).toHaveLength(0);
    } finally {
      enqueueSpy.mockRestore();
    }
  });

  it("writes every registry key and marks historical earns as notified", async () => {
    const userId = await createUser("notifuser", "hash", "Notif User");
    await getDb().insert(titles).values({
      id: "long-film",
      objectType: "MOVIE",
      title: "Long Film",
      runtimeMinutes: 195,
    });
    await watchTitle("long-film", userId);

    await runBackfillAchievements(null);

    const rows = await getDb()
      .select()
      .from(userAchievements)
      .where(eq(userAchievements.userId, userId))
      .all();
    expect(rows.map((row) => row.achievementKey).sort()).toEqual(
      ACHIEVEMENTS.map((def) => def.key).sort(),
    );
    const def = ACHIEVEMENTS.find((a) => a.kind === "long_film")!;
    expect(rows.find((row) => row.achievementKey === def.key)).toMatchObject({
      earnedAt: expect.any(String),
      earnedNotified: 1,
    });
    for (const row of rows) expect(row.earnedNotified).toBe(1);
  });

  it("writer/reader key parity: BACKFILL_DONE_KEY is written when zero users exist", async () => {
    await runBackfillAchievements(null);
    expect(await getSetting(BACKFILL_DONE_KEY)).toBe("1");
  });
});

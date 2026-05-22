import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { createUser } from "../repository";
import { logWatch } from "./watch-history";
import { getStreak, bumpStreak, recomputeStreakFromHistory } from "./streaks";

let userId: string;

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("streak-testuser", "hash");
});

afterAll(() => {
  teardownTestDb();
});

describe("getStreak", () => {
  it("returns null when no streak row exists", async () => {
    const result = await getStreak(userId);
    expect(result).toBeNull();
  });

  it("returns the streak row after bumpStreak", async () => {
    await bumpStreak(userId, "2024-01-01T10:00:00.000Z");
    const result = await getStreak(userId);
    expect(result).not.toBeNull();
    expect(result?.currentStreak).toBe(1);
    expect(result?.userId).toBe(userId);
  });
});

describe("bumpStreak — same-day double watch", () => {
  it("same-day second watch is a no-op", async () => {
    await bumpStreak(userId, "2024-01-01T08:00:00.000Z");
    const first = await getStreak(userId);
    expect(first?.currentStreak).toBe(1);

    await bumpStreak(userId, "2024-01-01T22:00:00.000Z");
    const second = await getStreak(userId);
    expect(second?.currentStreak).toBe(1);
    expect(second?.longestStreak).toBe(1);
  });
});

describe("bumpStreak — next day increments streak", () => {
  it("watching on consecutive days increases currentStreak", async () => {
    await bumpStreak(userId, "2024-01-01T10:00:00.000Z");
    await bumpStreak(userId, "2024-01-02T10:00:00.000Z");
    const result = await getStreak(userId);
    expect(result?.currentStreak).toBe(2);
    expect(result?.longestStreak).toBe(2);
  });

  it("watching three consecutive days builds streak to 3", async () => {
    await bumpStreak(userId, "2024-01-01T10:00:00.000Z");
    await bumpStreak(userId, "2024-01-02T10:00:00.000Z");
    await bumpStreak(userId, "2024-01-03T10:00:00.000Z");
    const result = await getStreak(userId);
    expect(result?.currentStreak).toBe(3);
    expect(result?.longestStreak).toBe(3);
  });
});

describe("bumpStreak — gap resets streak to 1", () => {
  it("gap of 2 days resets currentStreak to 1", async () => {
    await bumpStreak(userId, "2024-01-01T10:00:00.000Z");
    await bumpStreak(userId, "2024-01-02T10:00:00.000Z");
    // Day 4 — gap of 2 days after day 2
    await bumpStreak(userId, "2024-01-04T10:00:00.000Z");
    const result = await getStreak(userId);
    expect(result?.currentStreak).toBe(1);
  });

  it("longestStreak does not decrease on reset", async () => {
    await bumpStreak(userId, "2024-01-01T10:00:00.000Z");
    await bumpStreak(userId, "2024-01-02T10:00:00.000Z");
    await bumpStreak(userId, "2024-01-03T10:00:00.000Z"); // longest = 3
    await bumpStreak(userId, "2024-01-10T10:00:00.000Z"); // reset, longest stays 3
    const result = await getStreak(userId);
    expect(result?.currentStreak).toBe(1);
    expect(result?.longestStreak).toBe(3);
  });
});

describe("bumpStreak — longestStreak only increases", () => {
  it("longestStreak tracks the best streak ever", async () => {
    // First run: 3-day streak
    await bumpStreak(userId, "2024-01-01T10:00:00.000Z");
    await bumpStreak(userId, "2024-01-02T10:00:00.000Z");
    await bumpStreak(userId, "2024-01-03T10:00:00.000Z");

    // Gap — reset
    await bumpStreak(userId, "2024-01-10T10:00:00.000Z");

    // Second run: only 2-day streak
    await bumpStreak(userId, "2024-01-11T10:00:00.000Z");

    const result = await getStreak(userId);
    expect(result?.currentStreak).toBe(2);
    expect(result?.longestStreak).toBe(3); // preserved from first run
  });
});

describe("bumpStreak — first watch", () => {
  it("creates streak row with currentStreak=1, longestStreak=1", async () => {
    const result = await bumpStreak(userId, "2024-06-01T12:00:00.000Z");
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(1);
    expect(result.lastWatchDate).toBe("2024-06-01");
  });
});

// ─── recomputeStreakFromHistory ───────────────────────────────────────────────

describe("recomputeStreakFromHistory", () => {
  it("returns 0 streak when no watch history exists", async () => {
    const result = await recomputeStreakFromHistory(userId);
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(0);
    expect(result.lastWatchDate).toBeNull();
  });

  it("computes correct streak from consecutive watch history rows", async () => {
    // We need a title in the DB for FK constraints
    const { getDb } = await import("../schema");
    const { titles, watchHistory } = await import("../schema");
    const { randomUUID } = await import("node:crypto");

    const db = getDb();

    // Insert a title directly
    await db
      .insert(titles)
      .values({
        id: "title-streak-hist",
        objectType: "MOVIE",
        title: "Streak Movie",
        offersChecked: 0,
      })
      .onConflictDoNothing()
      .run();

    // Insert watch history for 3 consecutive days
    const dates = ["2024-03-01", "2024-03-02", "2024-03-03"];
    for (const date of dates) {
      await db
        .insert(watchHistory)
        .values({
          id: randomUUID(),
          userId,
          titleId: "title-streak-hist",
          watchedAt: `${date}T12:00:00.000Z`,
        })
        .run();
    }

    // recomputeStreakFromHistory uses today's date to decide if streak is active.
    // Since dates are in the past, currentStreak may be 0 (expired).
    const result = await recomputeStreakFromHistory(userId);
    expect(result.longestStreak).toBe(3);
  });

  it("identifies longest streak across gaps", async () => {
    const { getDb } = await import("../schema");
    const { titles, watchHistory } = await import("../schema");
    const { randomUUID } = await import("node:crypto");

    const db = getDb();
    await db
      .insert(titles)
      .values({
        id: "title-streak-hist2",
        objectType: "MOVIE",
        title: "Streak Movie 2",
        offersChecked: 0,
      })
      .onConflictDoNothing()
      .run();

    // 2-day run, then gap, then 4-day run
    const dates = [
      "2024-03-01",
      "2024-03-02", // run of 2
      "2024-03-10",
      "2024-03-11",
      "2024-03-12",
      "2024-03-13", // run of 4
    ];
    for (const date of dates) {
      await db
        .insert(watchHistory)
        .values({
          id: randomUUID(),
          userId,
          titleId: "title-streak-hist2",
          watchedAt: `${date}T12:00:00.000Z`,
        })
        .run();
    }

    const result = await recomputeStreakFromHistory(userId);
    expect(result.longestStreak).toBe(4);
  });
});

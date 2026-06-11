import {
  describe,
  it,
  expect,
  beforeEach,
  afterAll,
  afterEach,
} from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { createUser } from "../repository";
import {
  upsertAchievementDef,
  listAchievementDefs,
  getUserAchievements,
  upsertUserAchievement,
  listEarnedSince,
  markAchievementsNotified,
  sumXpForUser,
  sumXpBatch,
  appendUserAchievementEarns,
  getEarnHistory,
  getRecentlyEarned,
  getRarityForKey,
} from "./achievements";
import { initCache } from "../../cache";
import { MemoryCache } from "../../cache/memory";

function makeAchievementDef(key: string, points = 10) {
  return {
    key,
    kind: "count_movies" as const,
    threshold: 10,
    points,
    title: `Achievement ${key}`,
    description: `Description for ${key}`,
    icon: "Star",
  };
}

let testCache: MemoryCache;

beforeEach(async () => {
  setupTestDb();
  testCache = new MemoryCache(100, 60_000);
  initCache(testCache);
});

afterEach(async () => {
  await testCache.close();
});

afterAll(() => {
  teardownTestDb();
});

describe("upsertAchievementDef", () => {
  it("inserts a new achievement definition", async () => {
    await upsertAchievementDef(makeAchievementDef("test_key_1", 20));
    const defs = await listAchievementDefs();
    const found = defs.find((d) => d.key === "test_key_1");
    expect(found).toBeDefined();
    expect(found?.points).toBe(20);
  });

  it("updates an existing definition on conflict", async () => {
    await upsertAchievementDef(makeAchievementDef("test_key_2", 10));
    await upsertAchievementDef({
      ...makeAchievementDef("test_key_2", 50),
      title: "Updated Title",
    });
    const defs = await listAchievementDefs();
    const found = defs.find((d) => d.key === "test_key_2");
    expect(found?.points).toBe(50);
    expect(found?.title).toBe("Updated Title");
  });

  it("stores metadata JSON for genre/seasons/windowHours fields", async () => {
    await upsertAchievementDef({
      key: "genre_test",
      kind: "genre_count",
      threshold: 25,
      points: 40,
      title: "Genre Test",
      description: "desc",
      icon: "Star",
      genre: "Action",
    });
    const defs = await listAchievementDefs();
    const found = defs.find((d) => d.key === "genre_test");
    expect(found?.metadata).toBeTruthy();
    const meta = JSON.parse(found!.metadata!);
    expect(meta.genre).toBe("Action");
  });
});

describe("getUserAchievements", () => {
  it("returns empty array when user has no achievements", async () => {
    const userId = await createUser("ua-test-user", "hash");
    const result = await getUserAchievements(userId);
    expect(result).toHaveLength(0);
  });

  it("returns user achievements after upsert", async () => {
    const userId = await createUser("ua-test-user2", "hash");
    await upsertAchievementDef(makeAchievementDef("ua_key_1"));
    await upsertUserAchievement(userId, "ua_key_1", 5, null);

    const result = await getUserAchievements(userId);
    expect(result).toHaveLength(1);
    expect(result[0].achievementKey).toBe("ua_key_1");
    expect(result[0].progress).toBe(5);
    expect(result[0].earnedAt).toBeNull();
  });
});

describe("upsertUserAchievement newlyEarned detection", () => {
  it("newlyEarned = false on first insert with no earnedAt", async () => {
    const userId = await createUser("newly-earned-1", "hash");
    await upsertAchievementDef(makeAchievementDef("ne_key_1"));
    const result = await upsertUserAchievement(userId, "ne_key_1", 5, null);
    expect(result.newlyEarned).toBe(false);
  });

  it("newlyEarned = true when transitioning null → earned", async () => {
    const userId = await createUser("newly-earned-2", "hash");
    await upsertAchievementDef(makeAchievementDef("ne_key_2"));
    await upsertUserAchievement(userId, "ne_key_2", 5, null);
    const result = await upsertUserAchievement(
      userId,
      "ne_key_2",
      10,
      "2024-01-01T00:00:00.000Z",
    );
    expect(result.newlyEarned).toBe(true);
  });

  it("newlyEarned = false when already earned", async () => {
    const userId = await createUser("newly-earned-3", "hash");
    await upsertAchievementDef(makeAchievementDef("ne_key_3"));
    await upsertUserAchievement(
      userId,
      "ne_key_3",
      10,
      "2024-01-01T00:00:00.000Z",
    );
    const result = await upsertUserAchievement(
      userId,
      "ne_key_3",
      15,
      "2024-01-02T00:00:00.000Z",
    );
    expect(result.newlyEarned).toBe(false);
  });
});

describe("listEarnedSince", () => {
  it("returns achievements earned after the given timestamp", async () => {
    const userId = await createUser("earned-since-1", "hash");
    await upsertAchievementDef(makeAchievementDef("es_key_1"));
    await upsertAchievementDef(makeAchievementDef("es_key_2"));

    await upsertUserAchievement(
      userId,
      "es_key_1",
      10,
      "2024-01-01T00:00:00.000Z",
    );
    await upsertUserAchievement(
      userId,
      "es_key_2",
      10,
      "2024-06-01T00:00:00.000Z",
    );

    const result = await listEarnedSince(userId, "2024-03-01T00:00:00.000Z");
    expect(result).toHaveLength(1);
    expect(result[0].achievementKey).toBe("es_key_2");
  });

  it("returns empty when no achievements earned since the timestamp", async () => {
    const userId = await createUser("earned-since-2", "hash");
    await upsertAchievementDef(makeAchievementDef("es_key_3"));
    await upsertUserAchievement(
      userId,
      "es_key_3",
      10,
      "2024-01-01T00:00:00.000Z",
    );

    const result = await listEarnedSince(userId, "2025-01-01T00:00:00.000Z");
    expect(result).toHaveLength(0);
  });
});

describe("markAchievementsNotified", () => {
  it("sets earnedNotified = 1 for specified keys", async () => {
    const userId = await createUser("notified-1", "hash");
    await upsertAchievementDef(makeAchievementDef("notif_key_1"));
    await upsertUserAchievement(
      userId,
      "notif_key_1",
      10,
      "2024-01-01T00:00:00.000Z",
    );

    await markAchievementsNotified(userId, ["notif_key_1"]);

    const result = await getUserAchievements(userId);
    expect(result[0].earnedNotified).toBe(1);
  });

  it("is a no-op with empty keys array", async () => {
    const userId = await createUser("notified-2", "hash");
    // Should not throw
    await markAchievementsNotified(userId, []);
  });
});

describe("sumXpForUser", () => {
  it("returns 0 when user has no earned achievements", async () => {
    const userId = await createUser("xp-user-1", "hash");
    const xp = await sumXpForUser(userId);
    expect(xp).toBe(0);
  });

  it("sums points of earned achievements", async () => {
    const userId = await createUser("xp-user-2", "hash");
    await upsertAchievementDef(makeAchievementDef("xp_key_1", 10));
    await upsertAchievementDef(makeAchievementDef("xp_key_2", 25));
    await upsertUserAchievement(
      userId,
      "xp_key_1",
      10,
      "2024-01-01T00:00:00.000Z",
    );
    await upsertUserAchievement(userId, "xp_key_2", 5, null); // not earned

    const xp = await sumXpForUser(userId);
    expect(xp).toBe(10); // only xp_key_1 is earned
  });
});

describe("sumXpBatch with >50 users (chunking)", () => {
  it("returns correct XP for all users when userIds exceed 50", async () => {
    // Seed an achievement definition
    await upsertAchievementDef(makeAchievementDef("batch_key", 5));

    // Create 51 users, each with the achievement earned
    const userIds: string[] = [];
    for (let i = 0; i < 51; i++) {
      const uid = await createUser(`batch-user-${i}`, "hash");
      userIds.push(uid);
      await upsertUserAchievement(
        uid,
        "batch_key",
        10,
        "2024-01-01T00:00:00.000Z",
      );
    }

    const result = await sumXpBatch(userIds);

    // All 51 users should have XP = 5
    expect(result.size).toBe(51);
    for (const uid of userIds) {
      expect(result.get(uid)).toBe(5);
    }
  });

  it("returns empty map for empty input", async () => {
    const result = await sumXpBatch([]);
    expect(result.size).toBe(0);
  });

  it("users with no earned achievements are not in the result map", async () => {
    await upsertAchievementDef(makeAchievementDef("batch_key_2", 10));
    const uid = await createUser("batch-no-earn", "hash");
    await upsertUserAchievement(uid, "batch_key_2", 5, null); // not earned

    const result = await sumXpBatch([uid]);
    // Not earned means no row in the result (or 0)
    expect(result.get(uid) ?? 0).toBe(0);
  });
});

describe("appendUserAchievementEarns", () => {
  it("inserts earn audit rows and bumps earnedCount + lastEarnedAt", async () => {
    const userId = await createUser("append-earns-1", "hash");
    await upsertAchievementDef(makeAchievementDef("repeatable_key_1"));
    // Create the user_achievements row first
    await upsertUserAchievement(
      userId,
      "repeatable_key_1",
      2,
      "2024-01-01T00:00:00.000Z",
    );

    const earns = [
      {
        earnedAt: "2024-01-01T00:00:00.000Z",
        context: { month: "2024-01", count: 10 },
      },
      {
        earnedAt: "2024-02-01T00:00:00.000Z",
        context: { month: "2024-02", count: 12 },
      },
    ];
    await appendUserAchievementEarns(userId, "repeatable_key_1", earns);

    const rows = await getUserAchievements(userId);
    const row = rows.find((r) => r.achievementKey === "repeatable_key_1");
    expect(row).toBeDefined();
    expect(row?.earnedCount).toBe(2);
    expect(row?.lastEarnedAt).toBe("2024-02-01T00:00:00.000Z");
  });

  it("inserts all rows when earns exceed the insert chunk size", async () => {
    const userId = await createUser("append-earns-chunk", "hash");
    await upsertAchievementDef(makeAchievementDef("repeatable_key_chunk"));
    await upsertUserAchievement(userId, "repeatable_key_chunk", 0, null);

    // 45 earns spans 3 chunks of 20 (20 + 20 + 5)
    const earns = Array.from({ length: 45 }, (_, i) => ({
      earnedAt: `2024-01-01T00:00:${String(i).padStart(2, "0")}.000Z`,
      context: { index: i },
    }));
    await appendUserAchievementEarns(userId, "repeatable_key_chunk", earns);

    const history = await getEarnHistory(userId, "repeatable_key_chunk", 100);
    expect(history).toHaveLength(45);

    const rows = await getUserAchievements(userId);
    const row = rows.find((r) => r.achievementKey === "repeatable_key_chunk");
    expect(row?.earnedCount).toBe(45);
    expect(row?.lastEarnedAt).toBe("2024-01-01T00:00:44.000Z");
  });

  it("is a no-op when earns array is empty", async () => {
    const userId = await createUser("append-earns-2", "hash");
    await upsertAchievementDef(makeAchievementDef("repeatable_key_2"));
    await upsertUserAchievement(userId, "repeatable_key_2", 0, null);

    // Should not throw
    await appendUserAchievementEarns(userId, "repeatable_key_2", []);

    const rows = await getUserAchievements(userId);
    const row = rows.find((r) => r.achievementKey === "repeatable_key_2");
    expect(row?.earnedCount).toBe(0);
  });
});

describe("getEarnHistory", () => {
  it("returns earn rows ordered by earnedAt descending", async () => {
    const userId = await createUser("earn-history-1", "hash");
    await upsertAchievementDef(makeAchievementDef("earn_hist_key_1"));
    await upsertUserAchievement(
      userId,
      "earn_hist_key_1",
      3,
      "2024-01-01T00:00:00.000Z",
    );

    const earns = [
      {
        earnedAt: "2024-01-01T00:00:00.000Z",
        context: { month: "2024-01", count: 5 },
      },
      {
        earnedAt: "2024-02-01T00:00:00.000Z",
        context: { month: "2024-02", count: 7 },
      },
      {
        earnedAt: "2024-03-01T00:00:00.000Z",
        context: { month: "2024-03", count: 9 },
      },
    ];
    await appendUserAchievementEarns(userId, "earn_hist_key_1", earns);

    const history = await getEarnHistory(userId, "earn_hist_key_1");
    expect(history).toHaveLength(3);
    // Most recent first
    expect(history[0].earnedAt).toBe("2024-03-01T00:00:00.000Z");
    expect(history[2].earnedAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("respects the limit parameter", async () => {
    const userId = await createUser("earn-history-2", "hash");
    await upsertAchievementDef(makeAchievementDef("earn_hist_key_2"));
    await upsertUserAchievement(
      userId,
      "earn_hist_key_2",
      3,
      "2024-01-01T00:00:00.000Z",
    );

    const earns = [
      { earnedAt: "2024-01-01T00:00:00.000Z" },
      { earnedAt: "2024-02-01T00:00:00.000Z" },
      { earnedAt: "2024-03-01T00:00:00.000Z" },
    ];
    await appendUserAchievementEarns(userId, "earn_hist_key_2", earns);

    const history = await getEarnHistory(userId, "earn_hist_key_2", 2);
    expect(history).toHaveLength(2);
  });
});

describe("getRecentlyEarned", () => {
  it("returns earned achievements ordered by most recent earn desc", async () => {
    const userId = await createUser("recently-earned-1", "hash");
    await upsertAchievementDef(makeAchievementDef("recent_key_1", 10));
    await upsertAchievementDef(makeAchievementDef("recent_key_2", 20));

    // recent_key_1 earned in Jan, recent_key_2 in June
    await upsertUserAchievement(
      userId,
      "recent_key_1",
      10,
      "2024-01-01T00:00:00.000Z",
    );
    await upsertUserAchievement(
      userId,
      "recent_key_2",
      10,
      "2024-06-01T00:00:00.000Z",
    );

    const result = await getRecentlyEarned(userId);
    expect(result).toHaveLength(2);
    // Most recent first
    expect(result[0].achievementKey).toBe("recent_key_2");
    expect(result[1].achievementKey).toBe("recent_key_1");
  });

  it("excludes achievements not yet earned", async () => {
    const userId = await createUser("recently-earned-2", "hash");
    await upsertAchievementDef(makeAchievementDef("recent_key_3", 10));
    await upsertAchievementDef(makeAchievementDef("recent_key_4", 10));

    await upsertUserAchievement(userId, "recent_key_3", 5, null); // not earned
    await upsertUserAchievement(
      userId,
      "recent_key_4",
      10,
      "2024-01-01T00:00:00.000Z",
    ); // earned

    const result = await getRecentlyEarned(userId);
    expect(result).toHaveLength(1);
    expect(result[0].achievementKey).toBe("recent_key_4");
  });

  it("uses lastEarnedAt for repeatable achievements when ordering", async () => {
    const userId = await createUser("recently-earned-3", "hash");
    await upsertAchievementDef(makeAchievementDef("recent_key_5", 10));
    await upsertAchievementDef(makeAchievementDef("recent_key_6", 10));

    // One-shot earned in June, repeatable earned first in Jan but has lastEarnedAt in December
    await upsertUserAchievement(
      userId,
      "recent_key_5",
      10,
      "2024-06-01T00:00:00.000Z",
    );
    await upsertUserAchievement(
      userId,
      "recent_key_6",
      5,
      "2024-01-01T00:00:00.000Z",
    );
    // Bump the repeatable's lastEarnedAt to December (more recent)
    await appendUserAchievementEarns(userId, "recent_key_6", [
      {
        earnedAt: "2024-12-01T00:00:00.000Z",
        context: { month: "2024-12", count: 3 },
      },
    ]);

    const result = await getRecentlyEarned(userId);
    expect(result).toHaveLength(2);
    // recent_key_6 has lastEarnedAt = Dec, so it should come first
    expect(result[0].achievementKey).toBe("recent_key_6");
    expect(result[1].achievementKey).toBe("recent_key_5");
  });

  it("respects the limit parameter", async () => {
    const userId = await createUser("recently-earned-4", "hash");
    for (let i = 0; i < 5; i++) {
      await upsertAchievementDef(
        makeAchievementDef(`recent_limit_key_${i}`, 10),
      );
      await upsertUserAchievement(
        userId,
        `recent_limit_key_${i}`,
        10,
        "2024-01-01T00:00:00.000Z",
      );
    }

    const result = await getRecentlyEarned(userId, 3);
    expect(result).toHaveLength(3);
  });
});

// ─── getRarityForKey ──────────────────────────────────────────────────────────

describe("getRarityForKey", () => {
  it("returns null when fewer than 5 users have earned the achievement", async () => {
    await upsertAchievementDef(makeAchievementDef("rarity_test_sparse", 10));

    // Only 4 earners — below the RARITY_MIN_EARNERS threshold of 5
    for (let i = 0; i < 4; i++) {
      const uid = await createUser(`rarity-sparse-${i}`, "hash");
      await upsertUserAchievement(
        uid,
        "rarity_test_sparse",
        10,
        "2024-01-01T00:00:00.000Z",
      );
    }

    const result = await getRarityForKey("rarity_test_sparse");
    expect(result).toBeNull();
  });

  it("returns common bucket when >= 25% of users earned it", async () => {
    await upsertAchievementDef(makeAchievementDef("rarity_test_common", 10));

    // Create 10 users, all earn — 100% earner rate → common
    for (let i = 0; i < 10; i++) {
      const uid = await createUser(`rarity-common-${i}`, "hash");
      await upsertUserAchievement(
        uid,
        "rarity_test_common",
        10,
        "2024-01-01T00:00:00.000Z",
      );
    }

    const result = await getRarityForKey("rarity_test_common");
    expect(result).not.toBeNull();
    expect(result!.bucket).toBe("common");
    expect(result!.pct).toBeGreaterThanOrEqual(25);
  });

  it("returns rare bucket when 5–24% of users earned it", async () => {
    await upsertAchievementDef(makeAchievementDef("rarity_test_rare", 10));

    // Create 100 users, 10 earn → 10% earner rate → rare
    const earnerIds: string[] = [];
    for (let i = 0; i < 100; i++) {
      const uid = await createUser(`rarity-rare-${i}`, "hash");
      if (i < 10) earnerIds.push(uid);
    }
    for (const uid of earnerIds) {
      await upsertUserAchievement(
        uid,
        "rarity_test_rare",
        10,
        "2024-01-01T00:00:00.000Z",
      );
    }

    const result = await getRarityForKey("rarity_test_rare");
    expect(result).not.toBeNull();
    expect(result!.bucket).toBe("rare");
    expect(result!.pct).toBeGreaterThanOrEqual(5);
    expect(result!.pct).toBeLessThan(25);
  });

  it("caches the result so a second call returns the same value", async () => {
    await upsertAchievementDef(makeAchievementDef("rarity_test_cache", 10));

    // Create 8 users (>= min earners) all earning
    for (let i = 0; i < 8; i++) {
      const uid = await createUser(`rarity-cache-${i}`, "hash");
      await upsertUserAchievement(
        uid,
        "rarity_test_cache",
        10,
        "2024-01-01T00:00:00.000Z",
      );
    }

    const first = await getRarityForKey("rarity_test_cache");
    const second = await getRarityForKey("rarity_test_cache");

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.pct).toBe(first!.pct);
    expect(second!.bucket).toBe(first!.bucket);
  });

  it("caches null result for sparse achievements", async () => {
    await upsertAchievementDef(
      makeAchievementDef("rarity_test_null_cache", 10),
    );

    // Only 2 earners — below threshold
    for (let i = 0; i < 2; i++) {
      const uid = await createUser(`rarity-null-cache-${i}`, "hash");
      await upsertUserAchievement(
        uid,
        "rarity_test_null_cache",
        10,
        "2024-01-01T00:00:00.000Z",
      );
    }

    const first = await getRarityForKey("rarity_test_null_cache");
    const second = await getRarityForKey("rarity_test_null_cache");

    expect(first).toBeNull();
    expect(second).toBeNull();
  });
});

import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { eq } from "drizzle-orm";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { ACHIEVEMENTS, ACHIEVEMENT_META } from "./definitions";
import { syncAchievementRegistry, BACKFILL_DONE_KEY } from "./sync";
import { listAchievementDefs } from "../db/repository/achievements";
import { getRawDb } from "../db/bun-db";
import { getDb } from "../db/schema";
import { achievements, settings } from "../db/schema";
import * as backend from "../jobs/backend";

/** Count achievement INSERT statements issued through the raw sqlite handle. */
function countAchievementInserts(): {
  count: () => number;
  maxParams: () => number;
  restore: () => void;
} {
  const db = getRawDb();
  const statements: string[] = [];
  const original = db.prepare.bind(db);
  const spy = spyOn(db, "prepare").mockImplementation(((sql: string) => {
    if (/insert\s+into\s+["`]?achievements["`]?/i.test(sql))
      statements.push(sql);
    return original(sql);
  }) as typeof db.prepare);
  return {
    count: () => statements.length,
    maxParams: () =>
      Math.max(0, ...statements.map((sql) => (sql.match(/\?/g) ?? []).length)),
    restore: () => spy.mockRestore(),
  };
}

beforeEach(() => setupTestDb());
afterEach(() => teardownTestDb());

describe("syncAchievementRegistry", () => {
  it("inserts all ACHIEVEMENTS entries into the DB", async () => {
    await syncAchievementRegistry();
    const defs = await listAchievementDefs();
    expect(defs.length).toBe(ACHIEVEMENTS.length);

    const byKey = new Map(defs.map((d) => [d.key, d]));
    for (const a of ACHIEVEMENTS) {
      const row = byKey.get(a.key);
      const meta = ACHIEVEMENT_META.get(a.key);
      expect(row).toBeDefined();
      expect(row?.points).toBe(a.points);
      expect(row?.title).toBe(a.title);
      expect(row?.kind).toBe(a.kind);
      expect(row?.threshold).toBe(a.threshold);
      expect(row?.description).toBe(a.description);
      expect(row?.icon).toBe(a.icon);
      expect(row?.category).toBe(meta?.category);
      expect(row?.tier).toBe(meta?.tier);
      expect(row?.family ?? null).toBe(meta?.family ?? null);
      expect(row?.rungIndex ?? null).toBe(meta?.rungIndex ?? null);
      expect(row?.repeatable).toBe(meta?.repeatable ? 1 : 0);
      const metadata =
        a.genre !== undefined ||
        a.seasons !== undefined ||
        a.windowHours !== undefined
          ? JSON.stringify({
              ...(a.genre !== undefined ? { genre: a.genre } : {}),
              ...(a.seasons !== undefined ? { seasons: a.seasons } : {}),
              ...(a.windowHours !== undefined
                ? { windowHours: a.windowHours }
                : {}),
            })
          : null;
      expect(row?.metadata ?? null).toBe(metadata);
    }
  });

  it("is idempotent — calling twice does not throw or duplicate", async () => {
    await syncAchievementRegistry();
    await syncAchievementRegistry(); // should not throw
    const defs = await listAchievementDefs();
    expect(defs.length).toBe(ACHIEVEMENTS.length);
  });

  it("does NOT delete an orphan row (key not in registry)", async () => {
    // Insert a row with a key that doesn't exist in ACHIEVEMENTS
    const db = getDb();
    await db
      .insert(achievements)
      .values({
        key: "orphan_achievement",
        kind: "count_movies",
        threshold: 1,
        points: 1,
        title: "Orphan",
        description: "Old achievement",
        icon: "Star",
        metadata: null,
      })
      .run();

    await syncAchievementRegistry();

    // Orphan row should still exist
    const all = await listAchievementDefs();
    const orphan = all.find((d) => d.key === "orphan_achievement");
    expect(orphan).toBeDefined();
    // Plus all registry entries
    expect(all.length).toBe(ACHIEVEMENTS.length + 1);
  });

  it("enqueues backfill-achievements job when not yet done", async () => {
    const spy = spyOn(backend, "enqueueOnce").mockResolvedValue(undefined);
    await syncAchievementRegistry();
    expect(spy).toHaveBeenCalledWith("backfill-achievements");
    spy.mockRestore();
  });

  it("does not enqueue backfill when BACKFILL_DONE_KEY is set", async () => {
    const db = getDb();
    await db.insert(settings).values({ key: BACKFILL_DONE_KEY, value: "1" });
    const spy = spyOn(backend, "enqueueOnce").mockResolvedValue(undefined);
    await syncAchievementRegistry();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("batches definition upserts and skips them when unchanged (#1331)", async () => {
    const counter = countAchievementInserts();
    try {
      await syncAchievementRegistry();
      const first = counter.count();
      // One multi-row write (chunked only to stay under D1's 100-param cap),
      // never one INSERT per definition.
      expect(first).toBeGreaterThan(0);
      expect(first).toBeLessThan(ACHIEVEMENTS.length);
      expect(counter.maxParams()).toBeLessThanOrEqual(100);

      await syncAchievementRegistry();
      expect(counter.count()).toBe(first);
    } finally {
      counter.restore();
    }

    const defs = await listAchievementDefs();
    expect(defs.length).toBe(ACHIEVEMENTS.length);

    // Two stale rows in one re-sync must each get their own values back.
    const db = getDb();
    const [firstDef, secondDef] = ACHIEVEMENTS;
    await db
      .update(achievements)
      .set({ title: "Stale A", points: 1 })
      .where(eq(achievements.key, firstDef.key))
      .run();
    await db
      .update(achievements)
      .set({ title: "Stale B", points: 2 })
      .where(eq(achievements.key, secondDef.key))
      .run();
    await syncAchievementRegistry();
    const after = await listAchievementDefs();
    const rowA = after.find((d) => d.key === firstDef.key);
    const rowB = after.find((d) => d.key === secondDef.key);
    expect(rowA?.title).toBe(firstDef.title);
    expect(rowA?.points).toBe(firstDef.points);
    expect(rowB?.title).toBe(secondDef.title);
    expect(rowB?.points).toBe(secondDef.points);
  });

  it("updates stale rows with new values on re-sync", async () => {
    await syncAchievementRegistry();

    // Manually mutate one row to simulate stale data
    const db = getDb();
    const firstKey = ACHIEVEMENTS[0].key;
    await db
      .update(achievements)
      .set({ title: "Stale Title" })
      .where(eq(achievements.key, firstKey))
      .run();

    // Verify it's stale
    const before = await listAchievementDefs();
    const staleRow = before.find((d) => d.key === firstKey);
    expect(staleRow?.title).toBe("Stale Title");

    // Re-sync
    await syncAchievementRegistry();
    const after = await listAchievementDefs();
    const updated = after.find((d) => d.key === firstKey);
    expect(updated?.title).toBe(ACHIEVEMENTS[0].title);
  });
});

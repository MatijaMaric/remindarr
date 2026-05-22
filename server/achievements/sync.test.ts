import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { eq } from "drizzle-orm";
import { setupTestDb, teardownTestDb } from "../test-utils/setup";
import { ACHIEVEMENTS } from "./definitions";
import { syncAchievementRegistry } from "./sync";
import { listAchievementDefs } from "../db/repository/achievements";
import { getDb } from "../db/schema";
import { achievements, settings } from "../db/schema";
import * as backend from "../jobs/backend";

beforeEach(() => setupTestDb());
afterEach(() => teardownTestDb());

describe("syncAchievementRegistry", () => {
  it("inserts all ACHIEVEMENTS entries into the DB", async () => {
    await syncAchievementRegistry();
    const defs = await listAchievementDefs();
    expect(defs.length).toBe(ACHIEVEMENTS.length);

    const keys = new Set(defs.map((d) => d.key));
    for (const a of ACHIEVEMENTS) {
      expect(keys.has(a.key)).toBe(true);
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

  it("does not enqueue backfill when achievements_backfill_done_v2 is set", async () => {
    const db = getDb();
    await db
      .insert(settings)
      .values({ key: "achievements_backfill_done_v2", value: "1" });
    const spy = spyOn(backend, "enqueueOnce").mockResolvedValue(undefined);
    await syncAchievementRegistry();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
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

import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { makeParsedTitle } from "../../test-utils/fixtures";
import { upsertTitles, createUser } from "../repository";
import {
  getPinnedTitles,
  pinTitle,
  unpinTitle,
  reorderPinnedTitles,
  isPinnedTitle,
} from "./pinned";

let userId: string;

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("testuser", "hash");
});

afterAll(() => {
  teardownTestDb();
});

// Helper: create FK-parent titles movie-1..movie-N
async function insertTitles(count: number): Promise<string[]> {
  const ids = Array.from({ length: count }, (_, i) => `movie-${i + 1}`);
  await upsertTitles(
    ids.map((id) => makeParsedTitle({ id, title: `Movie ${id}` })),
  );
  return ids;
}

async function pinAll(ids: string[]): Promise<void> {
  for (const id of ids) {
    const result = await pinTitle(userId, id);
    expect(result.ok).toBe(true);
  }
}

async function getPositions(): Promise<{ id: string; position: number }[]> {
  const rows = await getPinnedTitles(userId);
  return rows.map((r) => ({ id: r.id, position: r.position }));
}

describe("pinTitle", () => {
  it("assigns sequential positions 0, 1, 2, …", async () => {
    const ids = await insertTitles(3);
    await pinAll(ids);

    expect(await getPositions()).toEqual([
      { id: "movie-1", position: 0 },
      { id: "movie-2", position: 1 },
      { id: "movie-3", position: 2 },
    ]);
  });

  it("rejects the 9th pin (MAX_PINNED=8)", async () => {
    const ids = await insertTitles(9);
    await pinAll(ids.slice(0, 8));

    const result = await pinTitle(userId, "movie-9");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("8");
    }
    expect(await getPinnedTitles(userId)).toHaveLength(8);
  });

  it("is a no-op when the title is already pinned", async () => {
    const ids = await insertTitles(2);
    await pinAll(ids);

    const result = await pinTitle(userId, "movie-1");
    expect(result.ok).toBe(true);

    expect(await getPositions()).toEqual([
      { id: "movie-1", position: 0 },
      { id: "movie-2", position: 1 },
    ]);
  });
});

describe("unpinTitle", () => {
  it("renumbers remaining rows dense 0..n-1 when a middle item is removed", async () => {
    const ids = await insertTitles(4);
    await pinAll(ids);

    await unpinTitle(userId, "movie-2");

    expect(await getPositions()).toEqual([
      { id: "movie-1", position: 0 },
      { id: "movie-3", position: 1 },
      { id: "movie-4", position: 2 },
    ]);
  });

  it("renumbers when the first item is removed", async () => {
    const ids = await insertTitles(3);
    await pinAll(ids);

    await unpinTitle(userId, "movie-1");

    expect(await getPositions()).toEqual([
      { id: "movie-2", position: 0 },
      { id: "movie-3", position: 1 },
    ]);
  });

  it("leaves positions intact when the last item is removed", async () => {
    const ids = await insertTitles(3);
    await pinAll(ids);

    await unpinTitle(userId, "movie-3");

    expect(await getPositions()).toEqual([
      { id: "movie-1", position: 0 },
      { id: "movie-2", position: 1 },
    ]);
  });

  it("is a no-op for a non-pinned title and does not disturb positions", async () => {
    const ids = await insertTitles(4);
    await pinAll(ids.slice(0, 3));

    await unpinTitle(userId, "movie-4");

    expect(await getPositions()).toEqual([
      { id: "movie-1", position: 0 },
      { id: "movie-2", position: 1 },
      { id: "movie-3", position: 2 },
    ]);
  });
});

describe("reorderPinnedTitles", () => {
  it("applies a full permutation", async () => {
    const ids = await insertTitles(3);
    await pinAll(ids);

    await reorderPinnedTitles(userId, ["movie-3", "movie-1", "movie-2"]);

    expect(await getPositions()).toEqual([
      { id: "movie-3", position: 0 },
      { id: "movie-1", position: 1 },
      { id: "movie-2", position: 2 },
    ]);
  });

  it("deletes rows omitted from the new order", async () => {
    const ids = await insertTitles(3);
    await pinAll(ids);

    await reorderPinnedTitles(userId, ["movie-3", "movie-1"]);

    expect(await getPositions()).toEqual([
      { id: "movie-3", position: 0 },
      { id: "movie-1", position: 1 },
    ]);
    expect(await isPinnedTitle(userId, "movie-2")).toBe(false);
  });

  it("inserts a brand-new titleId at its position", async () => {
    const ids = await insertTitles(3);
    await pinAll(ids.slice(0, 2));

    await reorderPinnedTitles(userId, ["movie-2", "movie-3", "movie-1"]);

    expect(await getPositions()).toEqual([
      { id: "movie-2", position: 0 },
      { id: "movie-3", position: 1 },
      { id: "movie-1", position: 2 },
    ]);
  });

  it("clears all pins when given an empty array", async () => {
    const ids = await insertTitles(3);
    await pinAll(ids);

    await reorderPinnedTitles(userId, []);

    expect(await getPinnedTitles(userId)).toHaveLength(0);
  });

  it("clamps to MAX_PINNED when given 10 ids", async () => {
    const ids = await insertTitles(10);
    await pinAll(ids.slice(0, 8));

    await reorderPinnedTitles(userId, ids);

    const rows = await getPositions();
    expect(rows).toHaveLength(8);
    expect(rows).toEqual(ids.slice(0, 8).map((id, i) => ({ id, position: i })));
    expect(await isPinnedTitle(userId, "movie-9")).toBe(false);
    expect(await isPinnedTitle(userId, "movie-10")).toBe(false);
  });
});

describe("getPinnedTitles", () => {
  it("returns rows ordered by position", async () => {
    const ids = await insertTitles(3);
    await pinAll(ids);
    await reorderPinnedTitles(userId, ["movie-2", "movie-3", "movie-1"]);

    const rows = await getPinnedTitles(userId);
    expect(rows.map((r) => r.id)).toEqual(["movie-2", "movie-3", "movie-1"]);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
  });
});

describe("isPinnedTitle", () => {
  it("returns true for a pinned title and false otherwise", async () => {
    await insertTitles(2);
    await pinTitle(userId, "movie-1");

    expect(await isPinnedTitle(userId, "movie-1")).toBe(true);
    expect(await isPinnedTitle(userId, "movie-2")).toBe(false);
  });
});

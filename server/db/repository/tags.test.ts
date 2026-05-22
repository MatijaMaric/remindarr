import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { makeParsedTitle } from "../../test-utils/fixtures";
import { createUser, upsertTitles, trackTitle } from "../repository";
import { getTagsForTitles, addTagToTitlesBulk } from "./tags";

let userId: string;

beforeEach(async () => {
  setupTestDb();
  userId = await createUser("tagsuser", "hash");
  await upsertTitles([
    makeParsedTitle({ id: "title-1", title: "Title One" }),
    makeParsedTitle({ id: "title-2", title: "Title Two" }),
    makeParsedTitle({ id: "title-3", title: "Title Three" }),
  ]);
  await trackTitle("title-1", userId);
  await trackTitle("title-2", userId);
  await trackTitle("title-3", userId);
});

afterAll(() => {
  teardownTestDb();
});

describe("getTagsForTitles", () => {
  it("returns empty map for empty titleIds array", async () => {
    const result = await getTagsForTitles(userId, []);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  it("returns map with correct tags grouped by titleId", async () => {
    await addTagToTitlesBulk(userId, ["title-1", "title-2"], "action");
    await addTagToTitlesBulk(userId, ["title-2"], "drama");

    const result = await getTagsForTitles(userId, ["title-1", "title-2"]);

    expect(result.get("title-1")).toEqual(["action"]);
    const title2Tags = result.get("title-2") ?? [];
    expect(title2Tags).toContain("action");
    expect(title2Tags).toContain("drama");
    expect(title2Tags).toHaveLength(2);
  });

  it("returns no entry for titleIds with no tags", async () => {
    const result = await getTagsForTitles(userId, ["title-1"]);
    expect(result.has("title-1")).toBe(false);
  });
});

describe("addTagToTitlesBulk", () => {
  it("inserts a tag for each titleId", async () => {
    await addTagToTitlesBulk(userId, ["title-1", "title-2"], "favorite");

    const result = await getTagsForTitles(userId, ["title-1", "title-2"]);
    expect(result.get("title-1")).toEqual(["favorite"]);
    expect(result.get("title-2")).toEqual(["favorite"]);
  });

  it("is idempotent — calling twice produces no duplicates", async () => {
    await addTagToTitlesBulk(userId, ["title-1"], "favorite");
    await addTagToTitlesBulk(userId, ["title-1"], "favorite");

    const result = await getTagsForTitles(userId, ["title-1"]);
    expect(result.get("title-1")).toEqual(["favorite"]);
  });

  it("handles more than 30 titleIds (chunking)", async () => {
    const extraTitles = Array.from({ length: 35 }, (_, i) => ({
      id: `bulk-title-${i}`,
      title: `Bulk Title ${i}`,
    }));
    await upsertTitles(
      extraTitles.map(({ id, title }) => makeParsedTitle({ id, title })),
    );
    for (const { id } of extraTitles) {
      await trackTitle(id, userId);
    }

    const ids = extraTitles.map((t) => t.id);
    await addTagToTitlesBulk(userId, ids, "bulk");

    const result = await getTagsForTitles(userId, ids);
    for (const id of ids) {
      expect(result.get(id)).toEqual(["bulk"]);
    }
  });
});

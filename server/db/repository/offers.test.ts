import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { setupTestDb, teardownTestDb } from "../../test-utils/setup";
import { makeParsedTitle, makeParsedOffer } from "../../test-utils/fixtures";
import { upsertTitles } from "./titles";
import { getOffersForTitles } from "./offers";
import { getGenresForTitles } from "./titles";

beforeEach(() => {
  setupTestDb();
});

afterAll(() => {
  teardownTestDb();
});

// Regression for #1009: D1 caps bound parameters at 100 per statement. Both
// getOffersForTitles and getGenresForTitles passed every title ID into a single
// `IN (...)` clause, which threw on D1 (→ HTTP 500 on GET /api/movies/tracking)
// for users tracking >100 titles. The chunked versions must accept arbitrarily
// large ID lists and still return one entry per title.
describe("IN-clause chunking for >100 titles", () => {
  const COUNT = 150;
  const ids = Array.from({ length: COUNT }, (_, i) => `chunk-${i}`);

  beforeEach(async () => {
    await upsertTitles(
      ids.map((id) =>
        makeParsedTitle({
          id,
          title: `Movie ${id}`,
          genres: ["Action"],
          offers: [makeParsedOffer({ titleId: id })],
        }),
      ),
    );
  });

  it("getOffersForTitles returns offers for every title past the 100-param limit", async () => {
    const map = await getOffersForTitles(ids);
    expect(map.size).toBe(COUNT);
    for (const id of ids) {
      expect(map.get(id)?.length).toBe(1);
    }
  });

  it("getGenresForTitles returns genres for every title past the 100-param limit", async () => {
    const map = await getGenresForTitles(ids);
    expect(map.size).toBe(COUNT);
    for (const id of ids) {
      expect(map.get(id)).toEqual(["Action"]);
    }
  });

  it("getOffersForTitles returns an empty map for no titles", async () => {
    const map = await getOffersForTitles([]);
    expect(map.size).toBe(0);
  });
});

import { describe, it, expect } from "bun:test";
import { buildCategoryParams, FILTER_KEYS } from "./BrowsePage";

describe("buildCategoryParams", () => {
  it("preserves filter params when switching category", () => {
    const prev = new URLSearchParams("category=popular&type=MOVIE&genre=Action&provider=8&language=en");
    const result = buildCategoryParams(prev, "upcoming");

    expect(result.get("category")).toBe("upcoming");
    expect(result.get("type")).toBe("MOVIE");
    expect(result.get("genre")).toBe("Action");
    expect(result.get("provider")).toBe("8");
    expect(result.get("language")).toBe("en");
  });

  it("deletes category param when switching to popular (default)", () => {
    const prev = new URLSearchParams("category=upcoming&type=SHOW");
    const result = buildCategoryParams(prev, "popular");

    expect(result.has("category")).toBe(false);
    expect(result.get("type")).toBe("SHOW");
  });

  it("sets category param for non-popular categories", () => {
    const prev = new URLSearchParams();
    const result = buildCategoryParams(prev, "top_rated");

    expect(result.get("category")).toBe("top_rated");
  });

  it("preserves daysBack when switching categories", () => {
    const prev = new URLSearchParams("category=new_releases&daysBack=7&type=MOVIE");
    const result = buildCategoryParams(prev, "popular");

    expect(result.has("category")).toBe(false);
    expect(result.get("daysBack")).toBe("7");
    expect(result.get("type")).toBe("MOVIE");
  });
});

describe("FILTER_KEYS", () => {
  it("contains all expected filter keys", () => {
    expect(FILTER_KEYS).toEqual([
      "type",
      "genre",
      "provider",
      "language",
      "daysBack",
      "yearMin",
      "yearMax",
      "minRating",
    ]);
  });
});
